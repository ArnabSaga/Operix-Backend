import { HttpStatus } from '@nestjs/common';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import type {
  SpreadsheetWriteCell,
  SpreadsheetWriteRow,
  SpreadsheetWriteSheet,
  SpreadsheetWriteWorkbook,
} from '../../shared/spreadsheet/spreadsheet.interface.js';
import { textCell } from '../../shared/spreadsheet/spreadsheet-write.helper.js';
import { EXPORT_LIMIT, EXPORT_TIMEZONE } from './export.constant.js';
import type { ExportMetadataInput } from './export.interface.js';

export type ExportCellValue = string | number | boolean | Date | null;

export function row(...cells: SpreadsheetWriteCell[]): SpreadsheetWriteRow {
  return cells;
}

export function headerRow(...headers: string[]): SpreadsheetWriteRow {
  return headers.map((header) => textCell(header));
}

export function metadataSheet(
  input: ExportMetadataInput,
): SpreadsheetWriteSheet {
  const rows: SpreadsheetWriteRow[] = [
    row(textCell('Field'), textCell('Value')),
    row(textCell('Dataset'), textCell(input.dataset)),
    row(textCell('Schema Version'), textCell(input.schemaVersion)),
    row(textCell('Generated At'), textCell(input.generatedAt.toISOString())),
    row(textCell('As Of'), textCell(input.asOf.toISOString())),
    row(textCell('Timezone'), textCell(EXPORT_TIMEZONE)),
    row(textCell('Viewer Role'), textCell(input.viewerRole)),
    row(textCell('Viewer ID'), textCell(input.viewerId)),
    row(textCell('Effective Scope'), textCell(input.effectiveScope)),
  ];

  for (const [key, value] of Object.entries(input.effectiveFilters)) {
    rows.push(row(textCell(`Filter: ${key}`), textCell(value ?? '')));
  }

  for (const [key, value] of Object.entries(input.extra ?? {})) {
    rows.push(row(textCell(key), textCell(value ?? '')));
  }

  return {
    name: 'Metadata',
    rows,
  };
}

export function assertWorkbookWithinExportLimits(
  workbook: SpreadsheetWriteWorkbook,
): void {
  let totalCells = 0;

  for (const sheet of workbook.sheets) {
    const isMetadata = sheet.name === 'Metadata';
    const dataRows = isMetadata ? 0 : Math.max(sheet.rows.length - 1, 0);

    if (dataRows > EXPORT_LIMIT.MAX_ROWS_PER_SHEET) {
      throw new AppException(
        HttpStatus.CONFLICT,
        APP_ERROR_CODE.EXPORT_LIMIT_EXCEEDED,
        'The export is too large.',
        {
          sheet: sheet.name,
          rows: dataRows,
          maxRows: EXPORT_LIMIT.MAX_ROWS_PER_SHEET,
        },
      );
    }

    for (const sheetRow of sheet.rows) {
      totalCells += sheetRow.length;
    }
  }

  if (totalCells > EXPORT_LIMIT.MAX_TOTAL_CELLS) {
    throw new AppException(
      HttpStatus.CONFLICT,
      APP_ERROR_CODE.EXPORT_LIMIT_EXCEEDED,
      'The export contains too many cells.',
      {
        cells: totalCells,
        maxCells: EXPORT_LIMIT.MAX_TOTAL_CELLS,
      },
    );
  }
}

export function assertWithinReadLimit(rows: unknown[], label: string): void {
  if (rows.length > EXPORT_LIMIT.MAX_ROWS_PER_SHEET) {
    throw new AppException(
      HttpStatus.CONFLICT,
      APP_ERROR_CODE.EXPORT_LIMIT_EXCEEDED,
      'The export is too large.',
      {
        dataset: label,
        rows: rows.length,
        maxRows: EXPORT_LIMIT.MAX_ROWS_PER_SHEET,
      },
    );
  }
}

export function formatExportDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}
