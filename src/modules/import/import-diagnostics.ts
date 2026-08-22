import { SPREADSHEET_LIMIT } from '../../shared/spreadsheet/spreadsheet.constant.js';
import type { SpreadsheetCell } from '../../shared/spreadsheet/spreadsheet.interface.js';
import { IMPORT_SEVERITY } from './import.constant.js';
import type { ImportPreviewIssue } from './import.interface.js';

export function buildIssue(input: {
  severity?: 'ERROR' | 'WARNING';
  sheet: string;
  row: number;
  cell?: SpreadsheetCell;
  field: string;
  sourceValue: unknown;
  normalizedValue: unknown;
  code: string;
  message: string;
}): ImportPreviewIssue {
  return {
    severity: input.severity ?? IMPORT_SEVERITY.ERROR,
    sheet: input.sheet,
    row: input.row,
    column: input.cell?.column,
    address: input.cell?.address,
    field: input.field,
    sourceValue: toDiagnosticValue(input.sourceValue),
    normalizedValue: toDiagnosticValue(input.normalizedValue),
    code: input.code,
    message: input.message,
  };
}

export function toDiagnosticValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = diagnosticText(value);

  if (text.length <= SPREADSHEET_LIMIT.MAX_PREVIEW_VALUE_LENGTH) {
    return text;
  }

  return `${text.slice(0, SPREADSHEET_LIMIT.MAX_PREVIEW_VALUE_LENGTH)}…`;
}

function diagnosticText(value: unknown): string {
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

  return JSON.stringify(value);
}

export function sortIssues(issues: ImportPreviewIssue[]): ImportPreviewIssue[] {
  return [...issues].sort((a, b) => {
    const sheet = a.sheet.localeCompare(b.sheet);
    if (sheet !== 0) return sheet;
    if (a.row !== b.row) return a.row - b.row;
    if ((a.column ?? 0) !== (b.column ?? 0)) {
      return (a.column ?? 0) - (b.column ?? 0);
    }
    return a.code.localeCompare(b.code);
  });
}
