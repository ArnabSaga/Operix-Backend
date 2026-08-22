import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AppException } from '../../shared/errors/app.exception.js';
import {
  validateImportWorkbook,
  type ValidatedImportWorkbook,
} from '../../shared/spreadsheet/spreadsheet-validation.js';
import { SpreadsheetService } from '../../shared/spreadsheet/spreadsheet.service.js';
import { SPREADSHEET_LIMIT } from '../../shared/spreadsheet/spreadsheet.constant.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { UserRole } from '../../../generated/prisma/enums.js';
import { assertWorkbookWithinResourceLimits } from './analyzers/workbook-analyzer.js';
import { ProfileRecognizer } from './analyzers/profile-recognizer.js';
import { IMPORT_DISPOSITION } from './import.constant.js';
import { sortIssues } from './import-diagnostics.js';
import type {
  ImportPreviewResponse,
  ImportPreviewResult,
  ImportType,
} from './import.interface.js';
import { ImportErrorReportService } from './import-error-report.service.js';

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

  private async buildPreview(
    expectedType: ImportType,
    file: Express.Multer.File | undefined,
  ): Promise<ImportPreviewResult> {
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

    return result;
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
}

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
