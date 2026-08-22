import {
  getCellText,
  normalizeHeader,
} from '../../../shared/spreadsheet/spreadsheet-cell.helper.js';
import type {
  SpreadsheetCell,
  SpreadsheetSheet,
  SpreadsheetWorkbook,
} from '../../../shared/spreadsheet/spreadsheet.interface.js';
import { IMPORT_ROW_ISSUE_CODE, IMPORT_SEVERITY } from '../import.constant.js';
import { buildIssue } from '../import-diagnostics.js';
import type { ImportPreviewIssue } from '../import.interface.js';

export interface HeaderMap {
  byName: Map<string, SpreadsheetCell>;
  duplicates: Set<string>;
  sequence: string[];
}

export function findSheet(
  workbook: SpreadsheetWorkbook,
  name: string,
): SpreadsheetSheet | null {
  return workbook.sheets.find((sheet) => sheet.name === name) ?? null;
}

export function buildHeaderMap(
  sheet: SpreadsheetSheet,
  headerRow: number,
): HeaderMap {
  const row = sheet.rows.find((item) => item.row === headerRow);
  const byName = new Map<string, SpreadsheetCell>();
  const duplicates = new Set<string>();
  const sequence: string[] = [];

  for (const cell of row?.cells ?? []) {
    const normalized = normalizeHeader(
      getCellText(sheet, headerRow, cell.column),
    );

    if (!normalized) {
      continue;
    }

    sequence.push(normalized);

    if (byName.has(normalized)) {
      duplicates.add(normalized);
      continue;
    }

    byName.set(normalized, cell);
  }

  return {
    byName,
    duplicates,
    sequence,
  };
}

export function validateRequiredHeaders(input: {
  sheet: SpreadsheetSheet;
  headerMap: HeaderMap;
  headerRow: number;
  requiredHeaders: string[];
}): ImportPreviewIssue[] {
  const issues: ImportPreviewIssue[] = [];

  for (const header of input.requiredHeaders) {
    if (!input.headerMap.byName.has(header)) {
      issues.push(
        buildIssue({
          sheet: input.sheet.name,
          row: input.headerRow,
          field: header,
          sourceValue: null,
          normalizedValue: header,
          code: 'MISSING_REQUIRED_COLUMN',
          message: `Required column ${header} is missing.`,
        }),
      );
    }

    if (input.headerMap.duplicates.has(header)) {
      issues.push(
        buildIssue({
          sheet: input.sheet.name,
          row: input.headerRow,
          field: header,
          sourceValue: header,
          normalizedValue: header,
          code: 'DUPLICATE_REQUIRED_COLUMN',
          message: `Required column ${header} appears more than once.`,
        }),
      );
    }
  }

  return issues;
}

export function getDataRows(sheet: SpreadsheetSheet, headerRow: number) {
  return sheet.rows.filter((row) => row.row > headerRow);
}

export function isBlankRow(row: { cells: SpreadsheetCell[] }): boolean {
  return row.cells.every((cell) => {
    if (cell.value === null || cell.value === undefined) {
      return true;
    }
    if (
      typeof cell.value === 'string' ||
      typeof cell.value === 'number' ||
      typeof cell.value === 'boolean' ||
      cell.value instanceof Date
    ) {
      return String(cell.value).trim().length === 0;
    }

    return false;
  });
}

export function getCellByHeader(
  row: { cells: SpreadsheetCell[] },
  headerMap: HeaderMap,
  header: string,
): SpreadsheetCell | undefined {
  const headerCell = headerMap.byName.get(header);
  if (!headerCell) {
    return undefined;
  }

  return row.cells.find((cell) => cell.column === headerCell.column);
}

export function readCellValue(
  row: { cells: SpreadsheetCell[] },
  headerMap: HeaderMap,
  header: string,
): { value: string; cell?: SpreadsheetCell; sourceValue: unknown } {
  const cell = getCellByHeader(row, headerMap, header);
  const sourceValue = cell?.formattedValue ?? cell?.value ?? null;
  const value = sourceValueToText(sourceValue).trim();

  return {
    value,
    cell,
    sourceValue,
  };
}

function sourceValueToText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  return '';
}

export function missingValueIssue(input: {
  sheet: string;
  row: number;
  cell?: SpreadsheetCell;
  field: string;
}): ImportPreviewIssue {
  return buildIssue({
    sheet: input.sheet,
    row: input.row,
    cell: input.cell,
    field: input.field,
    sourceValue: null,
    normalizedValue: null,
    code: IMPORT_ROW_ISSUE_CODE.REQUIRED_VALUE_MISSING,
    message: `${input.field} is required.`,
  });
}

export function formulaIssue(input: {
  sheet: string;
  row: number;
  cell: SpreadsheetCell;
  field: string;
}): ImportPreviewIssue {
  return buildIssue({
    sheet: input.sheet,
    row: input.row,
    cell: input.cell,
    field: input.field,
    sourceValue: input.cell.formula ?? null,
    normalizedValue: null,
    code: IMPORT_ROW_ISSUE_CODE.FORMULA_VALUE_NOT_ALLOWED,
    message: `${input.field} cannot use a formula cell.`,
  });
}

export function warning(input: {
  sheet: string;
  row: number;
  field: string;
  sourceValue: unknown;
  normalizedValue: unknown;
  code: string;
  message: string;
}): ImportPreviewIssue {
  return buildIssue({
    ...input,
    severity: IMPORT_SEVERITY.WARNING,
  });
}
