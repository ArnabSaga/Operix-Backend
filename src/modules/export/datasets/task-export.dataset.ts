import {
  booleanCell,
  dateCell,
  textCell,
} from '../../../shared/spreadsheet/spreadsheet-write.helper.js';
import type { SafeTaskResponse } from '../../task/task.interface.js';
import { EXPORT_SCHEMA_VERSION } from '../export.constant.js';
import type {
  ExportMetadataInput,
  ExportWorkbook,
} from '../export.interface.js';
import { headerRow, metadataSheet, row } from '../export-workbook.helper.js';

export function buildTaskExportWorkbook(
  tasks: SafeTaskResponse[],
  metadata: Omit<ExportMetadataInput, 'dataset' | 'schemaVersion'>,
): ExportWorkbook {
  return {
    sheets: [
      {
        name: 'Tasks',
        rows: [
          headerRow(
            'Task ID',
            'Reference Code',
            'Title',
            'Description',
            'Remarks',
            'Priority',
            'Status',
            'Due At',
            'Started At',
            'Completed At',
            'Cancelled At',
            'Team ID',
            'Category ID',
            'Created By ID',
            'Created At',
            'Updated At',
            'Is Overdue',
          ),
          ...tasks.map((task) =>
            row(
              textCell(task.id),
              textCell(task.referenceCode),
              textCell(task.title),
              textCell(task.description),
              textCell(task.remarks),
              textCell(task.priority),
              textCell(task.status),
              dateCell(task.dueAt),
              dateCell(task.startedAt),
              dateCell(task.completedAt),
              dateCell(task.cancelledAt),
              textCell(task.teamId),
              textCell(task.categoryId),
              textCell(task.createdById),
              dateCell(task.createdAt),
              dateCell(task.updatedAt),
              booleanCell(task.isOverdue),
            ),
          ),
        ],
      },
      metadataSheet({
        ...metadata,
        dataset: 'TASKS',
        schemaVersion: EXPORT_SCHEMA_VERSION.TASKS,
      }),
    ],
  };
}
