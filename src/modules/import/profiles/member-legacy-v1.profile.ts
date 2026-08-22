import { UserRole } from '../../../../generated/prisma/enums.js';
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
const IMPORT_OWNED_FIELDS = ['employeeId', 'email', 'designation', 'teamId'];

interface MemberCandidate {
  row: number;
  employeeId: string;
  email: string;
  teamId: string;
  designation: string | null;
}

export class MemberLegacyV1Profile implements ImportProfile {
  readonly id = IMPORT_PROFILE_ID.MEMBER_LEGACY_V1;
  readonly importType = IMPORT_TYPE.MEMBER;
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
    const candidates: MemberCandidate[] = [];
    const initialResults: ImportRowResult[] = [];
    const sourceIdentityCounts = new Map<string, number>();

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

      for (const field of [employeeId, email, teamId]) {
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

      if (issues.length > 0) {
        initialResults.push({
          disposition: IMPORT_DISPOSITION.INVALID,
          issues,
        });
        continue;
      }

      const candidate: MemberCandidate = {
        row: row.row,
        employeeId: employeeId.value,
        email: email.value.toLowerCase(),
        teamId: teamId.value,
        designation: designation.value || null,
      };
      const sourceKey = `${candidate.employeeId}|${candidate.email}`;
      sourceIdentityCounts.set(
        sourceKey,
        (sourceIdentityCounts.get(sourceKey) ?? 0) + 1,
      );
      candidates.push(candidate);
      initialResults.push({
        disposition: IMPORT_DISPOSITION.CANDIDATE,
        issues: [],
      });
    }

    const resolved = await resolveMemberReferences(context, candidates);
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

      const sourceKey = `${candidate.employeeId}|${candidate.email}`;
      if ((sourceIdentityCounts.get(sourceKey) ?? 0) > 1) {
        return {
          disposition: IMPORT_DISPOSITION.INVALID,
          issues: [
            buildIssue({
              sheet: SHEET_NAME,
              row: candidate.row,
              field: 'employeeId/email',
              sourceValue: sourceKey,
              normalizedValue: sourceKey,
              code: IMPORT_ROW_ISSUE_CODE.DUPLICATE_SOURCE_MEMBER,
              message: 'Duplicate source Member identity.',
            }),
          ],
        };
      }

      return evaluateMemberCandidate(candidate, resolved);
    });
  }
}

async function resolveMemberReferences(
  context: ImportProfileContext,
  candidates: MemberCandidate[],
) {
  const employeeIds = unique(candidates.map((item) => item.employeeId));
  const emails = unique(candidates.map((item) => item.email));
  const teamIds = unique(candidates.map((item) => item.teamId));

  const [users, teams] = await Promise.all([
    context.prisma.user.findMany({
      where: {
        role: UserRole.MEMBER,
        OR: [
          {
            employeeId: {
              in: employeeIds,
            },
          },
          {
            email: {
              in: emails,
            },
          },
        ],
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        designation: true,
        teamMembership: {
          select: {
            teamId: true,
          },
        },
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
  ]);

  return {
    usersByEmployeeId: new Map(
      users
        .filter((user) => user.employeeId)
        .map((user) => [user.employeeId!, user]),
    ),
    usersByEmail: new Map(
      users.map((user) => [user.email.toLowerCase(), user]),
    ),
    teamIds: new Set(teams.map((team) => team.id)),
  };
}

function evaluateMemberCandidate(
  candidate: MemberCandidate,
  resolved: Awaited<ReturnType<typeof resolveMemberReferences>>,
): ImportRowResult {
  const byEmployeeId = candidate.employeeId
    ? resolved.usersByEmployeeId.get(candidate.employeeId)
    : undefined;
  const byEmail = candidate.email
    ? resolved.usersByEmail.get(candidate.email)
    : undefined;

  if (!resolved.teamIds.has(candidate.teamId)) {
    return conflict(
      candidate,
      'teamId',
      candidate.teamId,
      IMPORT_ROW_ISSUE_CODE.TEAM_NOT_RESOLVED,
      'Team could not be resolved.',
    );
  }

  if (byEmployeeId && byEmail && byEmployeeId.id !== byEmail.id) {
    return conflict(
      candidate,
      'employeeId/email',
      `${candidate.employeeId}|${candidate.email}`,
      IMPORT_ROW_ISSUE_CODE.EMPLOYEE_EMAIL_CONFLICT,
      'Employee ID and email resolve different Members.',
    );
  }

  const user = byEmployeeId ?? byEmail;

  if (!user) {
    return {
      disposition: IMPORT_DISPOSITION.INVALID,
      issues: [
        buildIssue({
          sheet: SHEET_NAME,
          row: candidate.row,
          field: 'employeeId/email',
          sourceValue: `${candidate.employeeId}|${candidate.email}`,
          normalizedValue: `${candidate.employeeId}|${candidate.email}`,
          code: IMPORT_ROW_ISSUE_CODE.MEMBER_NOT_RESOLVED,
          message: 'Member could not be resolved to an existing account.',
        }),
      ],
    };
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

  const canonicalMatches =
    (user.employeeId ?? '') === candidate.employeeId &&
    user.email.toLowerCase() === candidate.email &&
    (user.designation ?? '') === (candidate.designation ?? '');

  if (canonicalMatches) {
    return {
      disposition: IMPORT_DISPOSITION.ALREADY_PRESENT,
      issues: [],
    };
  }

  return {
    disposition: IMPORT_DISPOSITION.CANDIDATE_UPDATE,
    issues: [],
  };
}

function conflict(
  candidate: MemberCandidate,
  field: string,
  sourceValue: string,
  code: string,
  message: string,
): ImportRowResult {
  return {
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

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
