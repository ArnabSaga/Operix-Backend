import {
  TaskPriority,
  TaskStatus,
  UserRole,
} from '../../../../generated/prisma/enums.js';
import type { SpreadsheetWorkbook } from '../../../shared/spreadsheet/spreadsheet.interface.js';
import type { SpreadsheetRow } from '../../../shared/spreadsheet/spreadsheet.interface.js';
import {
  IMPORT_DISPOSITION,
  IMPORT_PROFILE_ID,
  IMPORT_ROW_ISSUE_CODE,
  IMPORT_TYPE,
} from '../import.constant.js';
import { buildIssue } from '../import-diagnostics.js';
import type { ImportRowResult } from '../import.interface.js';
import type {
  ImportProfile,
  ImportProfileContext,
  ImportProfileRecognition,
} from './import-profile.interface.js';
import {
  buildHeaderMap,
  findSheet,
  formulaIssue,
  getDataRows,
  isBlankRow,
  missingValueIssue,
  readCellValue,
  validateRequiredHeaders,
  warning,
} from './profile-helpers.js';

const SHEET_NAME = 'Tasks';
const HEADER_ROW = 1;
const REQUIRED_HEADERS = [
  'task reference',
  'title',
  'status',
  'team id',
  'member employee id',
  'created by email',
  'assigned by email',
];
const OPTIONAL_HEADERS = [
  'description',
  'remarks',
  'priority',
  'created at',
  'assigned at',
  'started at',
  'due at',
  'completed at',
  'cancelled at',
];
const IMPORT_OWNED_FIELDS = [
  'referenceCode',
  'title',
  'description',
  'remarks',
  'priority',
  'status',
  'teamId',
  'assignee',
  'createdBy',
  'assignedBy',
  'createdAt',
  'assignedAt',
  'startedAt',
  'dueAt',
  'completedAt',
  'cancelledAt',
];

interface HistoricalTaskCandidate {
  row: number;
  referenceCode: string;
  title: string;
  description: string | null;
  remarks: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  teamId: string;
  memberEmployeeId: string;
  createdByEmail: string;
  assignedByEmail: string;
  createdAt: Date | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  dueAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

export class HistoricalTaskLegacyV1Profile implements ImportProfile {
  readonly id = IMPORT_PROFILE_ID.HISTORICAL_TASK_LEGACY_V1;
  readonly importType = IMPORT_TYPE.HISTORICAL_TASK;
  readonly selectedSheetName = SHEET_NAME;
  readonly headerRow = HEADER_ROW;
  readonly headerOrder = 'ANY_ORDER' as const;
  readonly requiredHeaders = REQUIRED_HEADERS;
  readonly optionalHeaders = OPTIONAL_HEADERS;
  readonly importOwnedFields = IMPORT_OWNED_FIELDS;

  recognize(workbook: SpreadsheetWorkbook): ImportProfileRecognition {
    const sheet = findSheet(workbook, SHEET_NAME);

    if (!sheet) {
      return {
        matches: false,
        structureIssues: [],
      };
    }

    const headerMap = buildHeaderMap(sheet, HEADER_ROW);
    const structureIssues = validateRequiredHeaders({
      sheet,
      headerMap,
      headerRow: HEADER_ROW,
      requiredHeaders: REQUIRED_HEADERS,
    });

    return {
      matches: true,
      structureIssues,
    };
  }

  async preview(
    workbook: SpreadsheetWorkbook,
    context: ImportProfileContext,
  ): Promise<ImportRowResult[]> {
    const sheet = findSheet(workbook, SHEET_NAME);

    if (!sheet) {
      return [];
    }

    const headerMap = buildHeaderMap(sheet, HEADER_ROW);
    const candidates: HistoricalTaskCandidate[] = [];
    const initialResults: ImportRowResult[] = [];
    const sourceReferenceCounts = new Map<string, number>();

    for (const row of getDataRows(sheet, HEADER_ROW)) {
      if (isBlankRow(row)) {
        initialResults.push({
          disposition: IMPORT_DISPOSITION.IGNORED_ROW,
          issues: [
            warning({
              sheet: sheet.name,
              row: row.row,
              field: 'row',
              sourceValue: null,
              normalizedValue: null,
              code: 'IGNORED_BLANK_ROW',
              message: 'Blank row ignored.',
            }),
          ],
        });
        continue;
      }

      const parsed = parseHistoricalTaskRow(sheet.name, row, headerMap);

      if (parsed.issues.length > 0 || !parsed.candidate) {
        initialResults.push({
          disposition: IMPORT_DISPOSITION.INVALID,
          issues: parsed.issues,
        });
        continue;
      }

      sourceReferenceCounts.set(
        parsed.candidate.referenceCode,
        (sourceReferenceCounts.get(parsed.candidate.referenceCode) ?? 0) + 1,
      );
      candidates.push(parsed.candidate);
      initialResults.push({
        disposition: IMPORT_DISPOSITION.CANDIDATE,
        issues: [],
      });
    }

    const resolved = await resolveHistoricalReferences(context, candidates);
    let candidateIndex = 0;

    return initialResults.map((result) => {
      if (result.disposition !== IMPORT_DISPOSITION.CANDIDATE) {
        return result;
      }

      const candidate = candidates[candidateIndex];
      candidateIndex += 1;

      if (!candidate) {
        return result;
      }

      if ((sourceReferenceCounts.get(candidate.referenceCode) ?? 0) > 1) {
        return {
          disposition: IMPORT_DISPOSITION.CONFLICT,
          issues: [
            buildIssue({
              sheet: SHEET_NAME,
              row: candidate.row,
              field: 'referenceCode',
              sourceValue: candidate.referenceCode,
              normalizedValue: candidate.referenceCode,
              code: IMPORT_ROW_ISSUE_CODE.DUPLICATE_SOURCE_ROW,
              message: 'Duplicate source Task reference.',
            }),
          ],
        };
      }

      return evaluateHistoricalTask(candidate, resolved);
    });
  }
}

function parseHistoricalTaskRow(
  sheet: string,
  row: { row: number; cells: Parameters<typeof readCellValue>[0]['cells'] },
  headerMap: Parameters<typeof readCellValue>[1],
): {
  candidate: HistoricalTaskCandidate | null;
  issues: ImportRowResult['issues'];
} {
  const referenceCode = readCellValue(row, headerMap, 'task reference');
  const title = readCellValue(row, headerMap, 'title');
  const status = readCellValue(row, headerMap, 'status');
  const teamId = readCellValue(row, headerMap, 'team id');
  const memberEmployeeId = readCellValue(row, headerMap, 'member employee id');
  const createdByEmail = readCellValue(row, headerMap, 'created by email');
  const assignedByEmail = readCellValue(row, headerMap, 'assigned by email');
  const description = readCellValue(row, headerMap, 'description');
  const remarks = readCellValue(row, headerMap, 'remarks');
  const priority = readCellValue(row, headerMap, 'priority');
  const issues: ImportRowResult['issues'] = [];

  for (const field of [
    referenceCode,
    title,
    status,
    teamId,
    memberEmployeeId,
    createdByEmail,
    assignedByEmail,
  ]) {
    if (field.cell?.hasFormula) {
      issues.push(
        formulaIssue({
          sheet,
          row: row.row,
          cell: field.cell,
          field: field.cell.address,
        }),
      );
    }

    if (!field.value) {
      issues.push(
        missingValueIssue({
          sheet,
          row: row.row,
          cell: field.cell,
          field: field.cell?.address ?? 'required field',
        }),
      );
    }
  }

  const mappedStatus = parseTerminalStatus(status.value);
  if (status.value && !mappedStatus) {
    issues.push(
      buildIssue({
        sheet,
        row: row.row,
        cell: status.cell,
        field: 'status',
        sourceValue: status.sourceValue,
        normalizedValue: status.value,
        code: IMPORT_ROW_ISSUE_CODE.HISTORICAL_STATUS_NOT_SUPPORTED,
        message:
          'Only COMPLETED and CANCELLED historical statuses are supported.',
      }),
    );
  }

  const mappedPriority = parsePriority(priority.value);
  if (priority.value && !mappedPriority) {
    issues.push(
      buildIssue({
        sheet,
        row: row.row,
        cell: priority.cell,
        field: 'priority',
        sourceValue: priority.sourceValue,
        normalizedValue: priority.value,
        code: 'UNKNOWN_PRIORITY_VALUE',
        message: 'Priority value is not supported.',
      }),
    );
  }

  const dates = {
    createdAt: parseOptionalDate(row, headerMap, sheet, 'created at', issues),
    assignedAt: parseOptionalDate(row, headerMap, sheet, 'assigned at', issues),
    startedAt: parseOptionalDate(row, headerMap, sheet, 'started at', issues),
    dueAt: parseOptionalDate(row, headerMap, sheet, 'due at', issues),
    completedAt: parseOptionalDate(
      row,
      headerMap,
      sheet,
      'completed at',
      issues,
    ),
    cancelledAt: parseOptionalDate(
      row,
      headerMap,
      sheet,
      'cancelled at',
      issues,
    ),
  };

  if (mappedStatus === TaskStatus.COMPLETED && !dates.completedAt) {
    issues.push(
      buildIssue({
        sheet,
        row: row.row,
        field: 'completedAt',
        sourceValue: null,
        normalizedValue: null,
        code: IMPORT_ROW_ISSUE_CODE.REQUIRED_VALUE_MISSING,
        message: 'COMPLETED historical Tasks require completedAt.',
      }),
    );
  }

  if (issues.length > 0 || !mappedStatus) {
    return {
      candidate: null,
      issues,
    };
  }

  return {
    candidate: {
      row: row.row,
      referenceCode: referenceCode.value,
      title: title.value,
      description: description.value || null,
      remarks: remarks.value || null,
      status: mappedStatus,
      priority: mappedPriority ?? TaskPriority.MEDIUM,
      teamId: teamId.value,
      memberEmployeeId: memberEmployeeId.value,
      createdByEmail: createdByEmail.value.toLowerCase(),
      assignedByEmail: assignedByEmail.value.toLowerCase(),
      ...dates,
    },
    issues: [],
  };
}

async function resolveHistoricalReferences(
  context: ImportProfileContext,
  candidates: HistoricalTaskCandidate[],
) {
  const referenceCodes = unique(candidates.map((item) => item.referenceCode));
  const teamIds = unique(candidates.map((item) => item.teamId));
  const memberEmployeeIds = unique(
    candidates.map((item) => item.memberEmployeeId),
  );
  const actorEmails = unique(
    candidates.flatMap((item) => [item.createdByEmail, item.assignedByEmail]),
  );

  const [tasks, teams, members, actors] = await Promise.all([
    context.prisma.task.findMany({
      where: {
        referenceCode: {
          in: referenceCodes,
        },
      },
      select: {
        referenceCode: true,
        title: true,
        description: true,
        remarks: true,
        priority: true,
        status: true,
        teamId: true,
        createdAt: true,
        dueAt: true,
        completedAt: true,
        cancelledAt: true,
      },
    }),
    context.prisma.team.findMany({
      where: {
        id: {
          in: teamIds,
        },
      },
      select: {
        id: true,
      },
    }),
    context.prisma.user.findMany({
      where: {
        role: UserRole.MEMBER,
        employeeId: {
          in: memberEmployeeIds,
        },
      },
      select: {
        id: true,
        employeeId: true,
      },
    }),
    context.prisma.user.findMany({
      where: {
        email: {
          in: actorEmails,
        },
      },
      select: {
        id: true,
        email: true,
      },
    }),
  ]);

  return {
    tasksByReference: new Map(tasks.map((task) => [task.referenceCode, task])),
    teamIds: new Set(teams.map((team) => team.id)),
    membersByEmployeeId: new Map(
      members
        .filter((member) => member.employeeId)
        .map((member) => [member.employeeId!, member]),
    ),
    actorsByEmail: new Map(
      actors.map((actor) => [actor.email.toLowerCase(), actor]),
    ),
  };
}

function evaluateHistoricalTask(
  candidate: HistoricalTaskCandidate,
  resolved: Awaited<ReturnType<typeof resolveHistoricalReferences>>,
): ImportRowResult {
  const issues = [];

  if (!resolved.teamIds.has(candidate.teamId)) {
    issues.push(
      issue(candidate, 'teamId', candidate.teamId, 'TEAM_NOT_RESOLVED'),
    );
  }

  if (!resolved.membersByEmployeeId.has(candidate.memberEmployeeId)) {
    issues.push(
      issue(
        candidate,
        'memberEmployeeId',
        candidate.memberEmployeeId,
        IMPORT_ROW_ISSUE_CODE.MEMBER_NOT_RESOLVED,
      ),
    );
  }

  if (!resolved.actorsByEmail.has(candidate.createdByEmail)) {
    issues.push(
      issue(
        candidate,
        'createdByEmail',
        candidate.createdByEmail,
        IMPORT_ROW_ISSUE_CODE.HISTORICAL_CREATOR_NOT_RESOLVED,
      ),
    );
  }

  if (!resolved.actorsByEmail.has(candidate.assignedByEmail)) {
    issues.push(
      issue(
        candidate,
        'assignedByEmail',
        candidate.assignedByEmail,
        IMPORT_ROW_ISSUE_CODE.HISTORICAL_ASSIGNER_NOT_RESOLVED,
      ),
    );
  }

  if (issues.length > 0) {
    return {
      disposition: IMPORT_DISPOSITION.INVALID,
      issues,
    };
  }

  const existing = resolved.tasksByReference.get(candidate.referenceCode);

  if (!existing) {
    return {
      disposition: IMPORT_DISPOSITION.CANDIDATE,
      issues: [],
    };
  }

  if (historicalTaskMatches(existing, candidate)) {
    return {
      disposition: IMPORT_DISPOSITION.ALREADY_PRESENT,
      issues: [],
    };
  }

  return {
    disposition: IMPORT_DISPOSITION.CONFLICT,
    issues: [
      issue(
        candidate,
        'referenceCode',
        candidate.referenceCode,
        IMPORT_ROW_ISSUE_CODE.IMPORT_CONFLICT,
      ),
    ],
  };
}

function historicalTaskMatches(
  existing: Awaited<
    ReturnType<typeof resolveHistoricalReferences>
  >['tasksByReference'] extends Map<string, infer T>
    ? T
    : never,
  candidate: HistoricalTaskCandidate,
): boolean {
  return (
    existing.title === candidate.title &&
    (existing.description ?? '') === (candidate.description ?? '') &&
    (existing.remarks ?? '') === (candidate.remarks ?? '') &&
    existing.priority === candidate.priority &&
    existing.status === candidate.status &&
    existing.teamId === candidate.teamId &&
    sameTime(existing.createdAt, candidate.createdAt) &&
    sameTime(existing.dueAt, candidate.dueAt) &&
    sameTime(existing.completedAt, candidate.completedAt) &&
    sameTime(existing.cancelledAt, candidate.cancelledAt)
  );
}

function parseTerminalStatus(value: string): TaskStatus | null {
  const normalized = value.trim().toUpperCase();

  if (normalized === TaskStatus.COMPLETED) return TaskStatus.COMPLETED;
  if (normalized === TaskStatus.CANCELLED) return TaskStatus.CANCELLED;

  return null;
}

function parsePriority(value: string): TaskPriority | null {
  if (!value) {
    return TaskPriority.MEDIUM;
  }

  const normalized = value.trim().toUpperCase();

  if (normalized === TaskPriority.LOW) return TaskPriority.LOW;
  if (normalized === TaskPriority.MEDIUM) return TaskPriority.MEDIUM;
  if (normalized === TaskPriority.HIGH) return TaskPriority.HIGH;
  if (normalized === TaskPriority.URGENT) return TaskPriority.URGENT;

  return null;
}

function parseOptionalDate(
  row: SpreadsheetRow,
  headerMap: Parameters<typeof readCellValue>[1],
  sheet: string,
  header: string,
  issues: ImportRowResult['issues'],
): Date | null {
  const field = readCellValue(row, headerMap, header);

  if (!field.value) {
    return null;
  }

  if (field.cell?.value instanceof Date) {
    return field.cell.value;
  }

  const date = new Date(field.value);

  if (Number.isNaN(date.getTime())) {
    issues.push(
      buildIssue({
        sheet,
        row: row.row,
        cell: field.cell,
        field: header,
        sourceValue: field.sourceValue,
        normalizedValue: field.value,
        code: IMPORT_ROW_ISSUE_CODE.INVALID_DATE,
        message: `${header} is not a valid date.`,
      }),
    );
    return null;
  }

  return date;
}

function issue(
  candidate: HistoricalTaskCandidate,
  field: string,
  value: string,
  code: string,
) {
  return buildIssue({
    sheet: SHEET_NAME,
    row: candidate.row,
    field,
    sourceValue: value,
    normalizedValue: value,
    code,
    message: `${field} could not be resolved or matched.`,
  });
}

function sameTime(left: Date | null, right: Date | null): boolean {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
