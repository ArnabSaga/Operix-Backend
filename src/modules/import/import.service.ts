import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { UserRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import type { PrismaTransactionClient } from '../../shared/database/transaction-client.type.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import {
  validateImportWorkbook,
  type ValidatedImportWorkbook,
} from '../../shared/spreadsheet/spreadsheet-validation.js';
import { SPREADSHEET_LIMIT } from '../../shared/spreadsheet/spreadsheet.constant.js';
import { SpreadsheetService } from '../../shared/spreadsheet/spreadsheet.service.js';
import { ProfileRecognizer } from './analyzers/profile-recognizer.js';
import { assertWorkbookWithinResourceLimits } from './analyzers/workbook-analyzer.js';
import { buildIssue, sortIssues } from './import-diagnostics.js';
import { ImportErrorReportService } from './import-error-report.service.js';
import {
  IMPORT_DISPOSITION,
  IMPORT_ERROR_CODE,
  IMPORT_PROFILE_ID,
  IMPORT_ROW_ISSUE_CODE,
  IMPORT_TYPE,
} from './import.constant.js';
import type {
  HistoricalTaskImportResponse,
  ImportAnalyzedRow,
  ImportPreviewResponse,
  ImportPreviewResult,
  ImportType,
  MemberImportResponse,
} from './import.interface.js';
import type {
  HistoricalTaskAnalyzedRow,
  HistoricalTaskCanonical,
  HistoricalTaskExisting,
} from './profiles/historical-task-legacy-v1.profile.js';
import { historicalTaskMatches } from './profiles/historical-task-legacy-v1.profile.js';
import type {
  MemberImportAnalyzedRow,
  MemberImportBaseline,
  MemberImportCanonical,
} from './profiles/member-legacy-v1.profile.js';
import { normalizeMemberImportDesignation } from './profiles/member-legacy-v1.profile.js';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly spreadsheetService: SpreadsheetService,
    private readonly profileRecognizer: ProfileRecognizer,
    private readonly errorReportService: ImportErrorReportService,
  ) {}

  async preview(
    viewer: OperixViewer,
    expectedType: ImportType,
    file: Express.Multer.File | undefined,
  ): Promise<ImportPreviewResponse> {
    this.assertSuperAdmin(viewer);
    const result = await this.buildPreview(expectedType, file);
    return publicPreview(result);
  }

  async errorReport(
    viewer: OperixViewer,
    expectedType: ImportType,
    file: Express.Multer.File | undefined,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.assertSuperAdmin(viewer);
    const preview = await this.buildPreview(expectedType, file);

    return {
      buffer: this.errorReportService.buildReport(preview),
      filename: buildErrorReportFilename(expectedType),
    };
  }

  async importMembers(
    viewer: OperixViewer,
    file: Express.Multer.File | undefined,
  ): Promise<MemberImportResponse> {
    this.assertSuperAdmin(viewer);

    const analysis = await this.buildAnalysis(IMPORT_TYPE.MEMBER, file);

    if (
      analysis.preview.mappingProfile !== IMPORT_PROFILE_ID.MEMBER_LEGACY_V1
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        IMPORT_ERROR_CODE.IMPORT_PROFILE_NOT_FOUND,
        'Workbook does not match the Member import profile.',
      );
    }

    if (
      analysis.preview.summary.invalidRows > 0 ||
      analysis.preview.summary.conflictRows > 0
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        IMPORT_ERROR_CODE.IMPORT_EXECUTION_BLOCKED,
        'Member import is blocked by invalid or conflicting rows.',
        publicPreview(analysis.preview),
      );
    }

    if (analysis.preview.summary.candidateRows > 0) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        IMPORT_ERROR_CODE.IMPORT_VERIFICATION_FAILED,
        'Member import verification failed.',
      );
    }

    const candidateUpdateRows = analysis.rows.filter(
      (row): row is MemberImportAnalyzedRow =>
        row.disposition === IMPORT_DISPOSITION.CANDIDATE_UPDATE &&
        isMemberImportCanonical(row.canonical) &&
        isMemberImportBaseline(row.baseline),
    );

    if (candidateUpdateRows.length === 0) {
      return {
        importType: IMPORT_TYPE.MEMBER,
        mappingProfile: IMPORT_PROFILE_ID.MEMBER_LEGACY_V1,
        summary: {
          sourceRowCount: analysis.preview.summary.sourceRowCount,
          consideredRows: analysis.preview.summary.consideredRows,
          ignoredRows: analysis.preview.summary.ignoredRows,
          updatedRows: 0,
          alreadyPresentRows: analysis.preview.summary.alreadyPresentRows,
        },
        verification: {
          membersUpdated: 0,
        },
      };
    }

    const execution = await runSerializableTransaction(
      this.prisma,
      async (tx) =>
        this.executeMemberCandidateUpdates(tx, viewer, candidateUpdateRows),
    );

    return {
      importType: IMPORT_TYPE.MEMBER,
      mappingProfile: IMPORT_PROFILE_ID.MEMBER_LEGACY_V1,
      summary: {
        sourceRowCount: analysis.preview.summary.sourceRowCount,
        consideredRows: analysis.preview.summary.consideredRows,
        ignoredRows: analysis.preview.summary.ignoredRows,
        updatedRows: execution.updatedRows,
        alreadyPresentRows:
          analysis.preview.summary.alreadyPresentRows +
          execution.concurrentAlreadyPresentRows,
      },
      verification: {
        membersUpdated: execution.membersUpdated,
      },
    };
  }

  async importHistoricalTasks(
    viewer: OperixViewer,
    file: Express.Multer.File | undefined,
  ): Promise<HistoricalTaskImportResponse> {
    this.assertSuperAdmin(viewer);

    const analysis = await this.buildAnalysis(
      IMPORT_TYPE.HISTORICAL_TASK,
      file,
    );

    if (
      analysis.preview.mappingProfile !==
      IMPORT_PROFILE_ID.HISTORICAL_TASK_LEGACY_V1
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        IMPORT_ERROR_CODE.IMPORT_PROFILE_NOT_FOUND,
        'Workbook does not match the historical Task import profile.',
      );
    }

    if (
      analysis.preview.summary.invalidRows > 0 ||
      analysis.preview.summary.conflictRows > 0
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        IMPORT_ERROR_CODE.IMPORT_EXECUTION_BLOCKED,
        'Historical Task import is blocked by invalid or conflicting rows.',
        publicPreview(analysis.preview),
      );
    }

    const candidateRows = analysis.rows.filter(
      (row): row is HistoricalTaskAnalyzedRow =>
        row.disposition === IMPORT_DISPOSITION.CANDIDATE &&
        isHistoricalTaskCanonical(row.canonical),
    );

    if (candidateRows.length === 0) {
      return {
        importType: IMPORT_TYPE.HISTORICAL_TASK,
        mappingProfile: IMPORT_PROFILE_ID.HISTORICAL_TASK_LEGACY_V1,
        summary: {
          sourceRowCount: analysis.preview.summary.sourceRowCount,
          consideredRows: analysis.preview.summary.consideredRows,
          ignoredRows: analysis.preview.summary.ignoredRows,
          importedRows: 0,
          alreadyPresentRows: analysis.preview.summary.alreadyPresentRows,
        },
        verification: {
          tasksCreated: 0,
          assignmentsCreated: 0,
          historyRowsCreated: 0,
        },
      };
    }

    let execution: Awaited<
      ReturnType<ImportService['executeHistoricalTaskCandidates']>
    >;

    try {
      execution = await runSerializableTransaction(this.prisma, async (tx) =>
        this.executeHistoricalTaskCandidates(tx, viewer, candidateRows),
      );
    } catch (error) {
      if (isUniqueReferenceConflict(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          IMPORT_ERROR_CODE.IMPORT_EXECUTION_BLOCKED,
          'Historical Task import is blocked because the database changed during execution.',
        );
      }

      throw error;
    }

    return {
      importType: IMPORT_TYPE.HISTORICAL_TASK,
      mappingProfile: IMPORT_PROFILE_ID.HISTORICAL_TASK_LEGACY_V1,
      summary: {
        sourceRowCount: analysis.preview.summary.sourceRowCount,
        consideredRows: analysis.preview.summary.consideredRows,
        ignoredRows: analysis.preview.summary.ignoredRows,
        importedRows: execution.importedRows,
        alreadyPresentRows:
          analysis.preview.summary.alreadyPresentRows +
          execution.concurrentAlreadyPresentRows,
      },
      verification: {
        tasksCreated: execution.tasksCreated,
        assignmentsCreated: execution.assignmentsCreated,
        historyRowsCreated: execution.historyRowsCreated,
      },
    };
  }

  private async buildPreview(
    expectedType: ImportType,
    file: Express.Multer.File | undefined,
  ): Promise<ImportPreviewResult> {
    const analysis = await this.buildAnalysis(expectedType, file);
    return analysis.preview;
  }

  private async buildAnalysis(
    expectedType: ImportType,
    file: Express.Multer.File | undefined,
  ): Promise<{
    preview: ImportPreviewResult;
    rows: ImportAnalyzedRow[];
  }> {
    const startedAt = Date.now();
    const validated = await validateImportWorkbook(file);
    let workbook;

    try {
      workbook = this.spreadsheetService.parse(validated.buffer);
    } catch {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'IMPORT_FILE_INVALID',
        'Workbook could not be parsed as a valid XLSX file.',
      );
    }

    assertWorkbookWithinResourceLimits(workbook);

    const { profile } = this.profileRecognizer.recognize(workbook);

    if (profile.importType !== expectedType) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'IMPORT_PROFILE_NOT_FOUND',
        'Workbook does not match the requested import type.',
      );
    }

    const rowResults = await profile.preview(workbook, {
      prisma: this.prisma,
    });
    const allIssues = sortIssues(rowResults.flatMap((row) => row.issues));
    const summary = summarizeRows(rowResults);
    const selectedSheet =
      workbook.sheets.find(
        (sheet) => sheet.name === profile.selectedSheetName,
      ) ?? workbook.sheets[0];

    const result: ImportPreviewResult = {
      importType: profile.importType,
      mappingProfile: profile.id,
      source: {
        originalName: validated.originalName,
        selectedSheet: selectedSheet?.name ?? profile.selectedSheetName,
        sheetNames: workbook.metadata.sheetNames,
        totalSourceRows: selectedSheet?.rowCount ?? 0,
      },
      summary,
      canImport: summary.invalidRows === 0 && summary.conflictRows === 0,
      issuesTruncated: allIssues.length > SPREADSHEET_LIMIT.MAX_PREVIEW_ISSUES,
      issues: allIssues.slice(0, SPREADSHEET_LIMIT.MAX_PREVIEW_ISSUES),
      allIssues,
    };

    this.logPreview(validated, result, Date.now() - startedAt);

    return {
      preview: result,
      rows: rowResults,
    };
  }

  private async executeHistoricalTaskCandidates(
    tx: PrismaTransactionClient,
    viewer: OperixViewer,
    rows: HistoricalTaskAnalyzedRow[],
  ): Promise<{
    importedRows: number;
    concurrentAlreadyPresentRows: number;
    tasksCreated: number;
    assignmentsCreated: number;
    historyRowsCreated: number;
  }> {
    const canonicalRows = rows
      .map((row) => row.canonical)
      .filter(isHistoricalTaskCanonical);
    await this.assertHistoricalReferencesStillValid(tx, canonicalRows);

    const existing = await this.findHistoricalTasksByReference(
      tx,
      canonicalRows.map((row) => row.referenceCode),
    );
    const existingByReference = new Map(
      existing.map((task) => [task.referenceCode, task]),
    );
    const rowsToCreate: HistoricalTaskCanonical[] = [];
    let concurrentAlreadyPresentRows = 0;

    for (const canonical of canonicalRows) {
      const current = existingByReference.get(canonical.referenceCode);

      if (!current) {
        rowsToCreate.push(canonical);
        continue;
      }

      if (historicalTaskMatches(current, canonical)) {
        concurrentAlreadyPresentRows += 1;
        continue;
      }

      throw new AppException(
        HttpStatus.CONFLICT,
        IMPORT_ERROR_CODE.IMPORT_EXECUTION_BLOCKED,
        'Historical Task import is blocked because the database changed after preview.',
        {
          issues: [
            buildIssue({
              sheet: 'Tasks',
              row: canonical.sourceRow,
              field: 'referenceCode',
              sourceValue: canonical.referenceCode,
              normalizedValue: canonical.referenceCode,
              code: IMPORT_ROW_ISSUE_CODE.IMPORT_CONFLICT,
              message:
                'A Task with this reference now exists with different imported canonical fields.',
            }),
          ],
        },
      );
    }

    if (rowsToCreate.length === 0) {
      return {
        importedRows: 0,
        concurrentAlreadyPresentRows,
        tasksCreated: 0,
        assignmentsCreated: 0,
        historyRowsCreated: 0,
      };
    }

    const importedAt = new Date();
    const createdTasks = await tx.task.createManyAndReturn({
      data: rowsToCreate.map((row) => ({
        referenceCode: row.referenceCode,
        title: row.title,
        description: row.description,
        remarks: row.remarks,
        priority: row.priority,
        status: row.status,
        dueAt: row.dueAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        cancelledAt: row.cancelledAt,
        teamId: row.teamId,
        createdById: row.createdById,
        createdAt: row.createdAt,
      })),
      select: {
        id: true,
        referenceCode: true,
      },
    });
    const createdTaskIdsByReference = new Map(
      createdTasks.map((task) => [task.referenceCode, task.id]),
    );
    const missingCreatedTask = rowsToCreate.find(
      (row) => !createdTaskIdsByReference.has(row.referenceCode),
    );

    if (missingCreatedTask) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        IMPORT_ERROR_CODE.IMPORT_VERIFICATION_FAILED,
        'Historical Task import verification failed.',
      );
    }

    const assignmentResult = await tx.taskAssignment.createMany({
      data: rowsToCreate.map((row) => ({
        taskId: createdTaskIdsByReference.get(row.referenceCode)!,
        memberId: row.memberId,
        assignedById: row.assignedById,
        assignedAt: row.assignedAt,
        unassignedAt: null,
        note: 'Imported from historical Excel migration.',
      })),
    });
    const historyResult = await tx.taskStatusHistory.createMany({
      data: rowsToCreate.map((row) => ({
        taskId: createdTaskIdsByReference.get(row.referenceCode)!,
        fromStatus: null,
        toStatus: row.status,
        changedById: viewer.userId,
        changedAt: importedAt,
        notes:
          'Historical terminal state imported from legacy Excel. Intermediate legacy workflow transitions were not reconstructed.',
      })),
    });
    const verifiedTasks = await this.findHistoricalTasksByReference(
      tx,
      rowsToCreate.map((row) => row.referenceCode),
    );
    const verifiedTasksByReference = new Map(
      verifiedTasks.map((task) => [task.referenceCode, task]),
    );
    const unverifiedTask = rowsToCreate.find((row) => {
      const task = verifiedTasksByReference.get(row.referenceCode);
      return !task || !historicalTaskMatches(task, row);
    });

    if (
      createdTasks.length !== rowsToCreate.length ||
      assignmentResult.count !== rowsToCreate.length ||
      historyResult.count !== rowsToCreate.length ||
      unverifiedTask
    ) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        IMPORT_ERROR_CODE.IMPORT_VERIFICATION_FAILED,
        'Historical Task import verification failed.',
      );
    }

    await tx.activityLog.create({
      data: {
        actorId: viewer.userId,
        action: 'HISTORICAL_TASKS_IMPORTED',
        entityType: 'IMPORT',
        entityId: null,
        metadata: {
          mappingProfile: IMPORT_PROFILE_ID.HISTORICAL_TASK_LEGACY_V1,
          sourceRows: rowsToCreate.length,
          importedRows: rowsToCreate.length,
          alreadyPresentRows: concurrentAlreadyPresentRows,
        },
      },
    });

    return {
      importedRows: rowsToCreate.length,
      concurrentAlreadyPresentRows,
      tasksCreated: createdTasks.length,
      assignmentsCreated: assignmentResult.count,
      historyRowsCreated: historyResult.count,
    };
  }

  private async executeMemberCandidateUpdates(
    tx: PrismaTransactionClient,
    viewer: OperixViewer,
    rows: MemberImportAnalyzedRow[],
  ): Promise<{
    updatedRows: number;
    concurrentAlreadyPresentRows: number;
    membersUpdated: number;
  }> {
    const candidates = rows
      .map((row) => ({
        canonical: row.canonical,
        baseline: row.baseline,
      }))
      .filter(isExecutableMemberImportRow);
    const memberIds = unique(candidates.map((row) => row.canonical.memberId));
    const currentMembers = await this.findMemberImportUsers(tx, memberIds);
    const currentById = new Map(
      currentMembers.map((member) => [member.id, member]),
    );
    const rowsToUpdate: MemberImportCanonical[] = [];
    let concurrentAlreadyPresentRows = 0;

    for (const row of candidates) {
      const current = currentById.get(row.canonical.memberId);

      if (!current) {
        throw this.memberImportExecutionBlocked(
          row.canonical,
          'memberId',
          row.canonical.memberId,
          'Member no longer exists.',
        );
      }

      this.assertMemberImportProtectedFields(row.canonical, current);

      const currentDesignation = normalizeMemberImportDesignation(
        current.designation,
      );
      const baselineDesignation = normalizeMemberImportDesignation(
        row.baseline.designation,
      );
      const targetDesignation = normalizeMemberImportDesignation(
        row.canonical.targetDesignation,
      );

      if (!targetDesignation) {
        throw new AppException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          IMPORT_ERROR_CODE.IMPORT_VERIFICATION_FAILED,
          'Member import verification failed.',
        );
      }

      if (currentDesignation === targetDesignation) {
        concurrentAlreadyPresentRows += 1;
        continue;
      }

      if (currentDesignation === baselineDesignation) {
        rowsToUpdate.push(row.canonical);
        continue;
      }

      throw new AppException(
        HttpStatus.CONFLICT,
        APP_ERROR_CODE.CONCURRENT_MODIFICATION,
        'The Member changed while processing this import. Please retry.',
      );
    }

    if (rowsToUpdate.length === 0) {
      return {
        updatedRows: 0,
        concurrentAlreadyPresentRows,
        membersUpdated: 0,
      };
    }

    for (const row of rowsToUpdate) {
      await tx.user.update({
        where: {
          id: row.memberId,
        },
        data: {
          designation: row.targetDesignation,
        },
        select: {
          id: true,
        },
      });
    }

    const verifiedMembers = await this.findMemberImportUsers(
      tx,
      rowsToUpdate.map((row) => row.memberId),
    );
    const verifiedById = new Map(
      verifiedMembers.map((member) => [member.id, member]),
    );
    const unverified = rowsToUpdate.find((row) => {
      const member = verifiedById.get(row.memberId);
      return (
        !member ||
        !this.memberImportProtectedFieldsMatch(row, member) ||
        normalizeMemberImportDesignation(member.designation) !==
          row.targetDesignation
      );
    });

    if (verifiedMembers.length !== rowsToUpdate.length || unverified) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        IMPORT_ERROR_CODE.IMPORT_VERIFICATION_FAILED,
        'Member import verification failed.',
      );
    }

    await tx.activityLog.create({
      data: {
        actorId: viewer.userId,
        action: 'MEMBERS_IMPORTED',
        entityType: 'IMPORT',
        entityId: null,
        metadata: {
          mappingProfile: IMPORT_PROFILE_ID.MEMBER_LEGACY_V1,
          sourceRows: rows.length,
          updatedRows: rowsToUpdate.length,
          alreadyPresentRows: concurrentAlreadyPresentRows,
        },
      },
    });

    return {
      updatedRows: rowsToUpdate.length,
      concurrentAlreadyPresentRows,
      membersUpdated: rowsToUpdate.length,
    };
  }

  private async findMemberImportUsers(
    tx: Pick<PrismaTransactionClient, 'user'>,
    memberIds: string[],
  ): Promise<MemberImportUser[]> {
    if (memberIds.length === 0) {
      return [];
    }

    return tx.user.findMany({
      where: {
        id: {
          in: memberIds,
        },
      },
      select: MEMBER_IMPORT_USER_SELECT,
    });
  }

  private assertMemberImportProtectedFields(
    row: MemberImportCanonical,
    current: MemberImportUser,
  ): void {
    if (!this.memberImportProtectedFieldsMatch(row, current)) {
      throw this.memberImportExecutionBlocked(
        row,
        'memberId',
        row.memberId,
        'Member identity or Team context changed during execution.',
      );
    }
  }

  private memberImportProtectedFieldsMatch(
    row: MemberImportCanonical,
    current: MemberImportUser,
  ): boolean {
    if (current.role !== UserRole.MEMBER) {
      return false;
    }

    if (
      row.employeeId &&
      normalizeMemberEmployeeId(current.employeeId) !== row.employeeId
    ) {
      return false;
    }

    if (row.email && normalizeMemberEmail(current.email) !== row.email) {
      return false;
    }

    return current.teamMembership?.teamId === row.teamId;
  }

  private memberImportExecutionBlocked(
    row: MemberImportCanonical,
    field: string,
    value: string,
    message: string,
  ): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      IMPORT_ERROR_CODE.IMPORT_EXECUTION_BLOCKED,
      'Member import is blocked because the database changed during execution.',
      {
        issues: [
          buildIssue({
            sheet: 'Members',
            row: row.sourceRow,
            field,
            sourceValue: value,
            normalizedValue: value,
            code: IMPORT_ROW_ISSUE_CODE.IMPORT_CONFLICT,
            message,
          }),
        ],
      },
    );
  }

  private async assertHistoricalReferencesStillValid(
    tx: Pick<PrismaTransactionClient, 'team' | 'user'>,
    rows: HistoricalTaskCanonical[],
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const teamIds = unique(rows.map((row) => row.teamId));
    const assigneeIds = unique(rows.map((row) => row.memberId));
    const actorIds = unique(
      rows.flatMap((row) => [row.createdById, row.assignedById]),
    );
    const [teams, assignees, actors] = await Promise.all([
      tx.team.findMany({
        where: {
          id: {
            in: teamIds,
          },
        },
        select: {
          id: true,
        },
      }),
      tx.user.findMany({
        where: {
          id: {
            in: assigneeIds,
          },
        },
        select: {
          id: true,
          role: true,
        },
      }),
      tx.user.findMany({
        where: {
          id: {
            in: actorIds,
          },
        },
        select: {
          id: true,
        },
      }),
    ]);
    const existingTeamIds = new Set(teams.map((team) => team.id));
    const assigneesById = new Map(
      assignees.map((assignee) => [assignee.id, assignee]),
    );
    const existingActorIds = new Set(actors.map((actor) => actor.id));

    for (const row of rows) {
      if (!existingTeamIds.has(row.teamId)) {
        throw this.importExecutionReferenceChanged(
          row,
          'teamId',
          row.teamId,
          'Referenced Team no longer exists.',
        );
      }

      const assignee = assigneesById.get(row.memberId);
      if (assignee?.role !== UserRole.MEMBER) {
        throw this.importExecutionReferenceChanged(
          row,
          'memberId',
          row.memberId,
          'Historical assignee no longer exists as a Member.',
        );
      }

      if (!existingActorIds.has(row.createdById)) {
        throw this.importExecutionReferenceChanged(
          row,
          'createdById',
          row.createdById,
          'Historical creator no longer exists.',
        );
      }

      if (!existingActorIds.has(row.assignedById)) {
        throw this.importExecutionReferenceChanged(
          row,
          'assignedById',
          row.assignedById,
          'Historical assigner no longer exists.',
        );
      }
    }
  }

  private async findHistoricalTasksByReference(
    tx: Pick<PrismaTransactionClient, 'task'>,
    referenceCodes: string[],
  ): Promise<HistoricalTaskExisting[]> {
    if (referenceCodes.length === 0) {
      return [];
    }

    return tx.task.findMany({
      where: {
        referenceCode: {
          in: referenceCodes,
        },
      },
      select: HISTORICAL_TASK_EXISTING_SELECT,
    });
  }

  private assertSuperAdmin(viewer: OperixViewer): void {
    if (viewer.role !== UserRole.SUPER_ADMIN) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Only Super Admin can access import previews.',
      );
    }
  }

  private logPreview(
    workbook: ValidatedImportWorkbook,
    preview: ImportPreviewResult,
    durationMs: number,
  ): void {
    this.logger.log({
      importType: preview.importType,
      profileId: preview.mappingProfile,
      originalName: workbook.originalName,
      fileSize: workbook.sizeBytes,
      sheetCount: preview.source.sheetNames.length,
      sourceRowCount: preview.summary.sourceRowCount,
      candidateRows: preview.summary.candidateRows,
      invalidRows: preview.summary.invalidRows,
      conflictRows: preview.summary.conflictRows,
      warningCount: preview.summary.warningCount,
      durationMs,
    });
  }

  private importExecutionReferenceChanged(
    row: HistoricalTaskCanonical,
    field: string,
    value: string,
    message: string,
  ): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      IMPORT_ERROR_CODE.IMPORT_EXECUTION_BLOCKED,
      'Historical Task import is blocked because a referenced record changed during execution.',
      {
        issues: [
          buildIssue({
            sheet: 'Tasks',
            row: row.sourceRow,
            field,
            sourceValue: value,
            normalizedValue: value,
            code: IMPORT_ROW_ISSUE_CODE.IMPORT_CONFLICT,
            message,
          }),
        ],
      },
    );
  }
}

const HISTORICAL_TASK_EXISTING_SELECT = {
  id: true,
  referenceCode: true,
  title: true,
  description: true,
  remarks: true,
  priority: true,
  status: true,
  teamId: true,
  createdById: true,
  createdAt: true,
  startedAt: true,
  dueAt: true,
  completedAt: true,
  cancelledAt: true,
  assignments: {
    where: {
      unassignedAt: null,
    },
    select: {
      memberId: true,
      assignedById: true,
      assignedAt: true,
      unassignedAt: true,
    },
    orderBy: {
      assignedAt: 'desc',
    },
    take: 2,
  },
} satisfies Prisma.TaskSelect;

const MEMBER_IMPORT_USER_SELECT = {
  id: true,
  role: true,
  status: true,
  employeeId: true,
  email: true,
  designation: true,
  teamMembership: {
    select: {
      teamId: true,
    },
  },
} satisfies Prisma.UserSelect;

type MemberImportUser = Prisma.UserGetPayload<{
  select: typeof MEMBER_IMPORT_USER_SELECT;
}>;

function summarizeRows(
  rows: { disposition: string; issues: { severity: string }[] }[],
) {
  const candidateRows = rows.filter(
    (row) => row.disposition === IMPORT_DISPOSITION.CANDIDATE,
  ).length;
  const candidateUpdateRows = rows.filter(
    (row) => row.disposition === IMPORT_DISPOSITION.CANDIDATE_UPDATE,
  ).length;
  const alreadyPresentRows = rows.filter(
    (row) => row.disposition === IMPORT_DISPOSITION.ALREADY_PRESENT,
  ).length;
  const invalidRows = rows.filter(
    (row) => row.disposition === IMPORT_DISPOSITION.INVALID,
  ).length;
  const conflictRows = rows.filter(
    (row) => row.disposition === IMPORT_DISPOSITION.CONFLICT,
  ).length;
  const ignoredRows = rows.filter(
    (row) => row.disposition === IMPORT_DISPOSITION.IGNORED_ROW,
  ).length;
  const consideredRows =
    candidateRows +
    candidateUpdateRows +
    alreadyPresentRows +
    invalidRows +
    conflictRows;
  const issues = rows.flatMap((row) => row.issues);

  return {
    sourceRowCount: consideredRows + ignoredRows,
    consideredRows,
    ignoredRows,
    candidateRows,
    candidateUpdateRows,
    alreadyPresentRows,
    invalidRows,
    conflictRows,
    warningCount: issues.filter((issue) => issue.severity === 'WARNING').length,
    issueCount: issues.length,
  };
}

function publicPreview(result: ImportPreviewResult): ImportPreviewResponse {
  const response: ImportPreviewResponse = {
    importType: result.importType,
    mappingProfile: result.mappingProfile,
    source: result.source,
    summary: result.summary,
    canImport: result.canImport,
    issuesTruncated: result.issuesTruncated,
    issues: result.issues,
  };
  return response;
}

function buildErrorReportFilename(importType: ImportType): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = importType === 'MEMBER' ? 'member' : 'historical-task';
  return `operix-${slug}-import-errors-${date}.xlsx`;
}

function isHistoricalTaskCanonical(
  value: unknown,
): value is HistoricalTaskCanonical {
  return (
    typeof value === 'object' &&
    value !== null &&
    'referenceCode' in value &&
    'memberId' in value &&
    'assignedAt' in value
  );
}

function isMemberImportCanonical(
  value: unknown,
): value is MemberImportCanonical {
  return (
    typeof value === 'object' &&
    value !== null &&
    'memberId' in value &&
    'targetDesignation' in value
  );
}

function isMemberImportBaseline(value: unknown): value is MemberImportBaseline {
  return typeof value === 'object' && value !== null && 'memberId' in value;
}

function isExecutableMemberImportRow(row: {
  canonical?: MemberImportCanonical | null;
  baseline?: MemberImportBaseline | null;
}): row is {
  canonical: MemberImportCanonical;
  baseline: MemberImportBaseline;
} {
  return (
    isMemberImportCanonical(row.canonical) &&
    isMemberImportBaseline(row.baseline)
  );
}

function normalizeMemberEmployeeId(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeMemberEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isUniqueReferenceConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
