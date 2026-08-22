import {
  numberCell,
  textCell,
} from '../../../shared/spreadsheet/spreadsheet-write.helper.js';
import type { MemberPerformanceSummary } from '../../performance/performance.interface.js';
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

export function buildMemberPerformanceExportWorkbook(
  members: MemberPerformanceSummary[],
  metadata: Omit<ExportMetadataInput, 'dataset' | 'schemaVersion'>,
): ExportWorkbook {
  return {
    sheets: [
      {
        name: 'Member Performance',
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
          ...members.map((entry) =>
            row(
              textCell(entry.member.id),
              textCell(entry.member.name),
              textCell(entry.member.employeeId),
              textCell(entry.member.designation),
              textCell(entry.member.status),
              textCell(entry.member.teamId),
              textCell(entry.member.teamName),
              numberCell(entry.performance.totalTasks),
              numberCell(entry.performance.eligibleTasks),
              numberCell(entry.performance.completedTasks),
              numberCell(entry.performance.cancelledTasks),
              numberCell(entry.performance.completionRate),
              numberCell(entry.performance.onTimeCompleted),
              numberCell(entry.performance.lateCompleted),
              numberCell(entry.performance.completedWithDeadline),
              numberCell(entry.performance.completedWithoutDeadline),
              numberCell(entry.performance.onTimeRate),
              numberCell(entry.performance.revisionCount),
              numberCell(entry.performance.tasksWithRevision),
              numberCell(entry.performance.averageCompletionMinutes),
              numberCell(entry.performance.completionTimeSampleCount),
              numberCell(entry.workload.activeTasks),
              numberCell(entry.workload.overdueTasks),
              ...statusCountCells(entry.workload.statusCounts),
              ...priorityCountCells(entry.workload.activePriorityCounts),
            ),
          ),
        ],
      },
      metadataSheet({
        ...metadata,
        dataset: 'MEMBER_PERFORMANCE',
        schemaVersion: EXPORT_SCHEMA_VERSION.MEMBER_PERFORMANCE,
        extra: {
          ...metadata.extra,
          'Performance Window': 'ALL_TIME',
        },
      }),
    ],
  };
}
