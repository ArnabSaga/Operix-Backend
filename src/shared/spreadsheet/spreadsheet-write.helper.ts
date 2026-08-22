import { HttpStatus } from '@nestjs/common';
import type { SpreadsheetWriteCell } from './spreadsheet.interface.js';
import { toSafeSpreadsheetText } from './spreadsheet-formula.guard.js';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';

export const SPREADSHEET_MAX_TEXT_CELL_LENGTH = 32_767;

export function textCell(value: unknown): SpreadsheetWriteCell {
  const text = toSafeSpreadsheetText(value);

  if (text.length > SPREADSHEET_MAX_TEXT_CELL_LENGTH) {
    throw new AppException(
      HttpStatus.CONFLICT,
      APP_ERROR_CODE.EXPORT_CELL_VALUE_TOO_LARGE,
      'A text value is too large to export safely.',
    );
  }

  return {
    value: text,
  };
}

export function numberCell(
  value: number | null | undefined,
): SpreadsheetWriteCell {
  return value === null || value === undefined
    ? blankCell()
    : {
        value,
      };
}

export function dateCell(value: Date | null | undefined): SpreadsheetWriteCell {
  return value ? { value } : blankCell();
}

export function booleanCell(
  value: boolean | null | undefined,
): SpreadsheetWriteCell {
  return value === null || value === undefined
    ? blankCell()
    : {
        value,
      };
}

export function blankCell(): SpreadsheetWriteCell {
  return {
    value: null,
  };
}
