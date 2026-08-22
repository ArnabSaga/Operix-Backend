import {
  TaskPriority,
  TaskStatus,
} from '../../../../generated/prisma/enums.js';
import {
  numberCell,
  textCell,
} from '../../../shared/spreadsheet/spreadsheet-write.helper.js';
import type {
  PriorityCounts,
  StatusCounts,
} from '../../performance/performance.interface.js';
import type { SpreadsheetWriteCell } from '../../../shared/spreadsheet/spreadsheet.interface.js';

export const TASK_STATUS_COLUMNS = Object.values(TaskStatus).map((status) => ({
  key: status,
  label: `Status - ${toTitle(status)}`,
}));

export const TASK_PRIORITY_COLUMNS = Object.values(TaskPriority).map(
  (priority) => ({
    key: priority,
    label: `Active Priority - ${toTitle(priority)}`,
  }),
);

export function statusCountCells(counts: StatusCounts): SpreadsheetWriteCell[] {
  return TASK_STATUS_COLUMNS.map((column) => numberCell(counts[column.key]));
}

export function priorityCountCells(
  counts: PriorityCounts,
): SpreadsheetWriteCell[] {
  return TASK_PRIORITY_COLUMNS.map((column) => numberCell(counts[column.key]));
}

export function statusHeaderCells(): SpreadsheetWriteCell[] {
  return TASK_STATUS_COLUMNS.map((column) => textCell(column.label));
}

export function priorityHeaderCells(): SpreadsheetWriteCell[] {
  return TASK_PRIORITY_COLUMNS.map((column) => textCell(column.label));
}

function toTitle(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}
