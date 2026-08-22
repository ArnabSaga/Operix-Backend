import {
  numberCell,
  textCell,
} from '../../../shared/spreadsheet/spreadsheet-write.helper.js';
import type {
  AdminDashboardWorkload,
  DashboardTrendsResponse,
  DashboardWorkloadResponse,
  MemberDashboardWorkload,
  MemberWorkloadRow,
  SuperAdminDashboardWorkload,
  TeamWorkloadRow,
} from '../../dashboard/dashboard.interface.js';
import { EXPORT_SCHEMA_VERSION } from '../export.constant.js';
import type {
  ExportMetadataInput,
  ExportWorkbook,
} from '../export.interface.js';
import { headerRow, metadataSheet, row } from '../export-workbook.helper.js';
import {
  priorityCountCells,
  priorityHeaderCells,
  statusCountCells,
  statusHeaderCells,
} from './common-export-columns.js';

export function buildDashboardWorkloadExportWorkbook(
  workload: DashboardWorkloadResponse,
  metadata: Omit<ExportMetadataInput, 'dataset' | 'schemaVersion'>,
): ExportWorkbook {
  const sheets = buildWorkloadSheets(workload);

  return {
    sheets: [
      ...sheets,
      metadataSheet({
        ...metadata,
        dataset: 'DASHBOARD_WORKLOAD',
        schemaVersion: EXPORT_SCHEMA_VERSION.DASHBOARD_WORKLOAD,
      }),
    ],
  };
}

function buildWorkloadSheets(workload: DashboardWorkloadResponse) {
  if ('byTeam' in workload) {
    return buildSuperAdminWorkloadSheets(workload);
  }

  if ('teamSummary' in workload) {
    return buildAdminWorkloadSheets(workload);
  }

  return buildMemberWorkloadSheets(workload);
}

export function buildDashboardTrendsExportWorkbook(
  trends: DashboardTrendsResponse,
  metadata: Omit<ExportMetadataInput, 'dataset' | 'schemaVersion'>,
): ExportWorkbook {
  return {
    sheets: [
      {
        name: 'Completion Trend',
        rows: [
          headerRow('Date', 'Completed Tasks'),
          ...trends.completionTrend.map((point) =>
            row(textCell(point.date), numberCell(point.completedTasks)),
          ),
        ],
      },
      metadataSheet({
        ...metadata,
        dataset: 'DASHBOARD_TRENDS',
        schemaVersion: EXPORT_SCHEMA_VERSION.DASHBOARD_TRENDS,
      }),
    ],
  };
}

function buildSuperAdminWorkloadSheets(workload: SuperAdminDashboardWorkload) {
  return [
    teamWorkloadSheet('Team Workload', workload.byTeam),
    memberWorkloadSheet('Member Workload', workload.byMember.data),
  ];
}

function buildAdminWorkloadSheets(workload: AdminDashboardWorkload) {
  return [
    {
      name: 'Team Summary',
      rows: [
        [
          ...headerRow(
            'Total Tasks',
            'Eligible Tasks',
            'Completed Tasks',
            'Cancelled Tasks',
            'Completion Rate',
            'Active Tasks',
            'Overdue Tasks',
            'Review Queue Tasks',
            'Revision Required Tasks',
          ),
          ...statusHeaderCells(),
          ...priorityHeaderCells(),
        ],
        row(
          numberCell(workload.teamSummary.performance.totalTasks),
          numberCell(workload.teamSummary.performance.eligibleTasks),
          numberCell(workload.teamSummary.performance.completedTasks),
          numberCell(workload.teamSummary.performance.cancelledTasks),
          numberCell(workload.teamSummary.performance.completionRate),
          numberCell(workload.teamSummary.workload.activeTasks),
          numberCell(workload.teamSummary.workload.overdueTasks),
          numberCell(workload.teamSummary.reviewQueueTasks),
          numberCell(workload.teamSummary.revisionRequiredTasks),
          ...statusCountCells(workload.teamSummary.workload.statusCounts),
          ...priorityCountCells(
            workload.teamSummary.workload.activePriorityCounts,
          ),
        ),
      ],
    },
    memberWorkloadSheet('Member Workload', workload.byMember.data),
  ];
}

function buildMemberWorkloadSheets(workload: MemberDashboardWorkload) {
  return [memberWorkloadSheet('My Workload', [workload.self])];
}

function teamWorkloadSheet(name: string, teams: TeamWorkloadRow[]) {
  return {
    name,
    rows: [
      [
        ...headerRow(
          'Team ID',
          'Team Name',
          'Admin ID',
          'Member Count',
          'Active Member Count',
          'Active Tasks',
          'Overdue Tasks',
          'Review Queue Tasks',
          'Revision Required Tasks',
        ),
        ...statusHeaderCells(),
      ],
      ...teams.map((team) =>
        row(
          textCell(team.teamId),
          textCell(team.teamName),
          textCell(team.adminId),
          numberCell(team.memberCount),
          numberCell(team.activeMemberCount),
          numberCell(team.activeTasks),
          numberCell(team.overdueTasks),
          numberCell(team.reviewQueueTasks),
          numberCell(team.revisionRequiredTasks),
          ...statusCountCells(team.statusCounts),
        ),
      ),
    ],
  };
}

function memberWorkloadSheet(name: string, members: MemberWorkloadRow[]) {
  return {
    name,
    rows: [
      [
        ...headerRow(
          'Member ID',
          'Name',
          'Employee ID',
          'Designation',
          'Account Status',
          'Team ID',
          'Team Name',
          'Active Tasks',
          'Overdue Tasks',
        ),
        ...statusHeaderCells(),
        ...priorityHeaderCells(),
      ],
      ...members.map((member) =>
        row(
          textCell(member.memberId),
          textCell(member.name),
          textCell(member.employeeId),
          textCell(member.designation),
          textCell(member.status),
          textCell(member.teamId),
          textCell(member.teamName),
          numberCell(member.activeTasks),
          numberCell(member.overdueTasks),
          ...statusCountCells(member.statusCounts),
          ...priorityCountCells(member.activePriorityCounts),
        ),
      ),
    ],
  };
}
