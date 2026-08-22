import type { SpreadsheetSheet } from './spreadsheet.interface.js';

export function getCellText(
  sheet: SpreadsheetSheet,
  rowNumber: number,
  columnNumber: number,
): string {
  const row = sheet.rows.find((item) => item.row === rowNumber);
  const cell = row?.cells.find((item) => item.column === columnNumber);

  if (!cell) {
    return '';
  }

  if (cell.formattedValue !== undefined) {
    return cell.formattedValue.trim();
  }

  if (cell.value === null || cell.value === undefined) {
    return '';
  }

  if (
    typeof cell.value === 'string' ||
    typeof cell.value === 'number' ||
    typeof cell.value === 'boolean' ||
    cell.value instanceof Date
  ) {
    return String(cell.value).trim();
  }

  return '';
}

export function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ');
}
