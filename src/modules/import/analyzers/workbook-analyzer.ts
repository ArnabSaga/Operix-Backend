import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception.js';
import { SPREADSHEET_LIMIT } from '../../../shared/spreadsheet/spreadsheet.constant.js';
import type { SpreadsheetWorkbook } from '../../../shared/spreadsheet/spreadsheet.interface.js';

export function assertWorkbookWithinResourceLimits(
  workbook: SpreadsheetWorkbook,
): void {
  if (workbook.sheets.length > SPREADSHEET_LIMIT.MAX_IMPORT_SHEETS) {
    throw limitExceeded('Workbook has too many sheets.');
  }

  let totalCells = 0;

  for (const sheet of workbook.sheets) {
    if (sheet.rowCount > SPREADSHEET_LIMIT.MAX_IMPORT_ROWS_PER_SHEET) {
      throw limitExceeded(`Sheet ${sheet.name} has too many rows.`);
    }

    if (sheet.columnCount > SPREADSHEET_LIMIT.MAX_IMPORT_COLUMNS_PER_SHEET) {
      throw limitExceeded(`Sheet ${sheet.name} has too many columns.`);
    }

    if (sheet.merges.length > SPREADSHEET_LIMIT.MAX_IMPORT_MERGES) {
      throw limitExceeded(`Sheet ${sheet.name} has too many merged regions.`);
    }

    totalCells += sheet.rows.reduce(
      (count, row) => count + row.cells.length,
      0,
    );
  }

  if (totalCells > SPREADSHEET_LIMIT.MAX_IMPORT_TOTAL_CELLS) {
    throw limitExceeded('Workbook has too many cells.');
  }
}

function limitExceeded(message: string): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    'IMPORT_RESOURCE_LIMIT_EXCEEDED',
    message,
  );
}
