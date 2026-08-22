import { DANGEROUS_SPREADSHEET_TEXT_PATTERN } from './spreadsheet.constant.js';

export function toSafeSpreadsheetText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = valueToText(value);

  if (DANGEROUS_SPREADSHEET_TEXT_PATTERN.test(text)) {
    return `'${text}`;
  }

  return text;
}

function valueToText(value: unknown): string {
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
