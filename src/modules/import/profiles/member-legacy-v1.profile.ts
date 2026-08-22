import {
  UserRole,
  type UserStatus,
} from '../../../../generated/prisma/enums.js';
import type { SpreadsheetWorkbook } from '../../../shared/spreadsheet/spreadsheet.interface.js';
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

const SHEET_NAME = 'Members';
const HEADER_ROW = 1;
const REQUIRED_HEADERS = ['employee id', 'email', 'team id'];
const OPTIONAL_HEADERS = ['name', 'designation'];
const IMPORT_OWNED_FIELDS = ['employeeId', 'email', 'teamId', 'designation'];
const WRITABLE_FIELDS = ['designation'] as const;
const MAX_DESIGNATION_LENGTH = 120;

interface MemberCandidate {
  row: number;
  employeeId: string | null;
  email: string | null;
  teamId: string;
  designation: string | null;
}

export interface MemberImportCanonical {
  sourceRow: number;
  memberId: string;
  employeeId: string | null;
  email: string | null;
  teamId: string;
  targetDesignation: string;
}

export interface MemberImportBaseline {
  memberId: string;
  employeeId: string | null;
  email: string;
  teamId: string | null;
  designation: string | null;
  role: UserRole;
  status: UserStatus;
}

export type MemberImportAnalyzedRow = ImportRowResult<
  MemberImportCanonical,
  { memberId: string },
  MemberImportBaseline
>;

export class MemberLegacyV1Profile implements ImportProfile {
  readonly id = IMPORT_PROFILE_ID.MEMBER_LEGACY_V1;
  readonly importType = IMPORT_TYPE.MEMBER;
  readonly selectedSheetName = SHEET_NAME;
  readonly headerRow = HEADER_ROW;
  readonly headerOrder = 'ANY_ORDER' as const;
  readonly requiredHeaders = REQUIRED_HEADERS;
  readonly optionalHeaders = OPTIONAL_HEADERS;
  readonly importOwnedFields = IMPORT_OWNED_FIELDS;
  readonly writableFields = WRITABLE_FIELDS;

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
    const candidates: MemberCandidate[] = [];
    const initialResults: ImportRowResult[] = [];

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

      const employeeId = readCellValue(row, headerMap, 'employee id');
      const email = readCellValue(row, headerMap, 'email');
      const teamId = readCellValue(row, headerMap, 'team id');
      const designation = readCellValue(row, headerMap, 'designation');
      const issues = [];

      for (const field of [employeeId, email, teamId, designation]) {
        if (field.cell?.hasFormula) {
          issues.push(
            formulaIssue({
              sheet: sheet.name,
              row: row.row,
              cell: field.cell,
              field: field.cell.address,
            }),
          );
        }
      }

      if (!employeeId.value && !email.value) {
        issues.push(
          buildIssue({
            sheet: sheet.name,
            row: row.row,
            field: 'employeeId/email',
            sourceValue: null,
            normalizedValue: null,
            code: IMPORT_ROW_ISSUE_CODE.MEMBER_NOT_RESOLVED,
            message: 'Member identity requires employeeId or email.',
          }),
        );
      }

      if (!teamId.value) {
        issues.push(
          missingValueIssue({
            sheet: sheet.name,
            row: row.row,
            cell: teamId.cell,
            field: 'teamId',
          }),
        );
      }

      if (
        designation.value &&
        designation.value.length > MAX_DESIGNATION_LENGTH
      ) {
        issues.push(
          buildIssue({
            sheet: sheet.name,
            row: row.row,
            cell: designation.cell,
            field: 'designation',
            sourceValue: designation.value,
            normalizedValue: designation.value,
            code: IMPORT_ROW_ISSUE_CODE.MEMBER_DESIGNATION_INVALID,
            message: 'Designation must be at most 120 characters.',
          }),
        );
      }

      if (issues.length > 0) {
        initialResults.push({
          disposition: IMPORT_DISPOSITION.INVALID,
          issues,
        });
        continue;
      }

      candidates.push({
        row: row.row,
        employeeId: employeeId.value || null,
        email: email.value ? email.value.toLowerCase() : null,
        teamId: teamId.value,
        designation: designation.value || null,
      });
      initialResults.push({
        disposition: IMPORT_DISPOSITION.CANDIDATE,
        issues: [],
      });
    }

    const resolved = await resolveMemberReferences(context, candidates);
    const resolvedMemberCounts = countResolvedMembers(candidates, resolved);
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

      return evaluateMemberCandidate(candidate, resolved, resolvedMemberCounts);
    });
  }
}

async function resolveMemberReferences(
  context: ImportProfileContext,
  candidates: MemberCandidate[],
) {
  const employeeIds = uniqueNullable(candidates.map((item) => item.employeeId));
  const emails = uniqueNullable(candidates.map((item) => item.email));
  const teamIds = unique(candidates.map((item) => item.teamId));
  const memberOr: (
    | {
        employeeId: {
          in: string[];
        };
      }
    | {
        email: {
          in: string[];
        };
      }
  )[] = [];

  if (employeeIds.length > 0) {
    memberOr.push({
      employeeId: {
        in: employeeIds,
      },
    });
  }

  if (emails.length > 0) {
    memberOr.push({
      email: {
        in: emails,
      },
    });
  }

  const [users, teams] = await Promise.all([
    memberOr.length > 0
      ? context.prisma.user.findMany({
          where: {
            role: UserRole.MEMBER,
            OR: memberOr,
          },
          select: {
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
          },
        })
      : Promise.resolve([]),
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
  ]);

  return {
    usersByEmployeeId: new Map(
      users
        .filter((user) => user.employeeId)
        .map((user) => [user.employeeId!, user]),
    ),
    usersByEmail: new Map(
      users.map((user) => [normalizeEmail(user.email), user]),
    ),
    teamIds: new Set(teams.map((team) => team.id)),
  };
}

function countResolvedMembers(
  candidates: MemberCandidate[],
  resolved: Awaited<ReturnType<typeof resolveMemberReferences>>,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const candidate of candidates) {
    const resolution = resolveCandidateUser(candidate, resolved);

    if (resolution.kind === 'resolved') {
      counts.set(resolution.user.id, (counts.get(resolution.user.id) ?? 0) + 1);
    }
  }

  return counts;
}

function evaluateMemberCandidate(
  candidate: MemberCandidate,
  resolved: Awaited<ReturnType<typeof resolveMemberReferences>>,
  resolvedMemberCounts: Map<string, number>,
): MemberImportAnalyzedRow {
  if (!resolved.teamIds.has(candidate.teamId)) {
    return conflict(
      candidate,
      'teamId',
      candidate.teamId,
      IMPORT_ROW_ISSUE_CODE.TEAM_NOT_RESOLVED,
      'Team could not be resolved.',
    );
  }

  const resolution = resolveCandidateUser(candidate, resolved);

  if (resolution.kind === 'identityConflict') {
    return conflict(
      candidate,
      'employeeId/email',
      sourceIdentity(candidate),
      IMPORT_ROW_ISSUE_CODE.EMPLOYEE_EMAIL_CONFLICT,
      'Employee ID and email resolve different Members.',
    );
  }

  if (resolution.kind === 'notResolved') {
    return {
      disposition: IMPORT_DISPOSITION.INVALID,
      issues: [
        buildIssue({
          sheet: SHEET_NAME,
          row: candidate.row,
          field: 'employeeId/email',
          sourceValue: sourceIdentity(candidate),
          normalizedValue: sourceIdentity(candidate),
          code: IMPORT_ROW_ISSUE_CODE.MEMBER_NOT_RESOLVED,
          message: 'Member could not be resolved to an existing account.',
        }),
      ],
    };
  }

  const user = resolution.user;

  if ((resolvedMemberCounts.get(user.id) ?? 0) > 1) {
    return {
      disposition: IMPORT_DISPOSITION.INVALID,
      issues: [
        buildIssue({
          sheet: SHEET_NAME,
          row: candidate.row,
          field: 'employeeId/email',
          sourceValue: sourceIdentity(candidate),
          normalizedValue: user.id,
          code: IMPORT_ROW_ISSUE_CODE.DUPLICATE_SOURCE_MEMBER,
          message: 'Duplicate source rows resolve to the same Member.',
        }),
      ],
    };
  }

  const identityIssue = assertIdentity(candidate, user);

  if (identityIssue) {
    return identityIssue;
  }

  if (user.teamMembership?.teamId !== candidate.teamId) {
    return conflict(
      candidate,
      'teamId',
      candidate.teamId,
      IMPORT_ROW_ISSUE_CODE.TEAM_MEMBERSHIP_CONFLICT,
      'Source Team does not match current Operix Team.',
    );
  }

  const baseline: MemberImportBaseline = {
    memberId: user.id,
    employeeId: user.employeeId,
    email: normalizeEmail(user.email),
    teamId: user.teamMembership.teamId,
    designation: normalizeDesignation(user.designation),
    role: user.role,
    status: user.status,
  };

  if (!candidate.designation) {
    return {
      sourceRow: candidate.row,
      disposition: IMPORT_DISPOSITION.ALREADY_PRESENT,
      resolved: {
        memberId: user.id,
      },
      baseline,
      issues: [],
    };
  }

  const targetDesignation = normalizeDesignation(candidate.designation);

  if (!targetDesignation) {
    return {
      sourceRow: candidate.row,
      disposition: IMPORT_DISPOSITION.ALREADY_PRESENT,
      resolved: {
        memberId: user.id,
      },
      baseline,
      issues: [],
    };
  }

  if (baseline.designation === targetDesignation) {
    return {
      sourceRow: candidate.row,
      disposition: IMPORT_DISPOSITION.ALREADY_PRESENT,
      resolved: {
        memberId: user.id,
      },
      baseline,
      issues: [],
    };
  }

  return {
    sourceRow: candidate.row,
    disposition: IMPORT_DISPOSITION.CANDIDATE_UPDATE,
    canonical: {
      sourceRow: candidate.row,
      memberId: user.id,
      employeeId: candidate.employeeId,
      email: candidate.email,
      teamId: candidate.teamId,
      targetDesignation,
    },
    resolved: {
      memberId: user.id,
    },
    baseline,
    issues: [],
  };
}

function resolveCandidateUser(
  candidate: MemberCandidate,
  resolved: Awaited<ReturnType<typeof resolveMemberReferences>>,
):
  | { kind: 'resolved'; user: MemberResolvedUser }
  | { kind: 'identityConflict' }
  | { kind: 'notResolved' } {
  const byEmployeeId = candidate.employeeId
    ? resolved.usersByEmployeeId.get(candidate.employeeId)
    : undefined;
  const byEmail = candidate.email
    ? resolved.usersByEmail.get(candidate.email)
    : undefined;

  if (byEmployeeId && byEmail && byEmployeeId.id !== byEmail.id) {
    return { kind: 'identityConflict' };
  }

  const user = byEmployeeId ?? byEmail;

  if (!user) {
    return { kind: 'notResolved' };
  }

  return { kind: 'resolved', user };
}

type MemberResolvedUser =
  Awaited<
    ReturnType<typeof resolveMemberReferences>
  >['usersByEmail'] extends Map<string, infer T>
    ? T
    : never;

function assertIdentity(
  candidate: MemberCandidate,
  user: MemberResolvedUser,
): MemberImportAnalyzedRow | null {
  if (
    candidate.employeeId &&
    normalizeEmployeeId(user.employeeId) !== candidate.employeeId
  ) {
    return conflict(
      candidate,
      'employeeId',
      candidate.employeeId,
      IMPORT_ROW_ISSUE_CODE.MEMBER_IDENTITY_CONFLICT,
      'Source employeeId does not match the resolved Member.',
    );
  }

  if (candidate.email && normalizeEmail(user.email) !== candidate.email) {
    return conflict(
      candidate,
      'email',
      candidate.email,
      IMPORT_ROW_ISSUE_CODE.MEMBER_IDENTITY_CONFLICT,
      'Source email does not match the resolved Member.',
    );
  }

  return null;
}

function conflict(
  candidate: MemberCandidate,
  field: string,
  sourceValue: string,
  code: string,
  message: string,
): MemberImportAnalyzedRow {
  return {
    sourceRow: candidate.row,
    disposition: IMPORT_DISPOSITION.CONFLICT,
    issues: [
      buildIssue({
        sheet: SHEET_NAME,
        row: candidate.row,
        field,
        sourceValue,
        normalizedValue: sourceValue,
        code,
        message,
      }),
    ],
  };
}

export function normalizeMemberImportDesignation(
  value: string | null | undefined,
): string | null {
  return normalizeDesignation(value);
}

function normalizeDesignation(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmployeeId(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function sourceIdentity(candidate: MemberCandidate): string {
  return `${candidate.employeeId ?? ''}|${candidate.email ?? ''}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function uniqueNullable(values: (string | null)[]): string[] {
  return unique(values.filter((value): value is string => Boolean(value)));
}
