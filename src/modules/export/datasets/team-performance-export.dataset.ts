import {
  numberCell,
  textCell,
} from '../../../shared/spreadsheet/spreadsheet-write.helper.js';
import type { TeamPerformanceResponse } from '../../performance/performance.interface.js';
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

export function buildTeamPerformanceExportWorkbook(
  result: TeamPerformanceResponse,
  metadata: Omit<ExportMetadataInput, 'dataset' | 'schemaVersion'>,
): ExportWorkbook {
  return {
    sheets: [
      {
        name: 'Team Performance',
        rows: [
          [
            ...headerRow(
              'Team ID',
              'Team Name',
              'Admin ID',
              'Member Count',
              'Active Member Count',
              'Total Tasks',
              'Eligible Tasks',
              'Completed Tasks',
              'Cancelled Tasks',
              'Completion Rate',
              'On-Time Completed',
              'Late Completed',
              'Completed With Deadline',
              'Completed Without Deadline',
              'On-Time Rate',
              'Revision Count',
              'Tasks With Revision',
              'Average Completion Minutes',
              'Completion Time Sample Count',
              'Active Tasks',
              'Overdue Tasks',
            ),
            ...statusHeaderCells(),
            ...priorityHeaderCells(),
          ],
          row(
            textCell(result.team.id),
            textCell(result.team.name),
            textCell(result.team.adminId),
            numberCell(result.team.memberCount),
            numberCell(result.team.activeMemberCount),
            numberCell(result.performance.totalTasks),
            numberCell(result.performance.eligibleTasks),
            numberCell(result.performance.completedTasks),
            numberCell(result.performance.cancelledTasks),
            numberCell(result.performance.completionRate),
            numberCell(result.performance.onTimeCompleted),
            numberCell(result.performance.lateCompleted),
            numberCell(result.performance.completedWithDeadline),
            numberCell(result.performance.completedWithoutDeadline),
            numberCell(result.performance.onTimeRate),
            numberCell(result.performance.revisionCount),
            numberCell(result.performance.tasksWithRevision),
            numberCell(result.performance.averageCompletionMinutes),
            numberCell(result.performance.completionTimeSampleCount),
            numberCell(result.workload.activeTasks),
            numberCell(result.workload.overdueTasks),
            ...statusCountCells(result.workload.statusCounts),
            ...priorityCountCells(result.workload.activePriorityCounts),
          ),
        ],
      },
      metadataSheet({
        ...metadata,
        dataset: 'TEAM_PERFORMANCE',
        schemaVersion: EXPORT_SCHEMA_VERSION.TEAM_PERFORMANCE,
        extra: {
          ...metadata.extra,
          'Performance Window': 'ALL_TIME',
        },
      }),
    ],
  };
}
