import type { SpreadsheetService } from '../../spreadsheet/spreadsheet.service.js';
import {
  DOCUMENT_TEXT_XLSX_CELL_LIMITATION,
  DOCUMENT_TEXT_XLSX_COLUMN_LIMITATION,
  DOCUMENT_TEXT_XLSX_MAX_CELL_CHARS,
  DOCUMENT_TEXT_XLSX_MAX_COLUMNS_PER_SHEET,
  DOCUMENT_TEXT_XLSX_MAX_ROWS_PER_SHEET,
  DOCUMENT_TEXT_XLSX_MAX_SHEETS,
  DOCUMENT_TEXT_XLSX_MEDIA_LIMITATION,
  DOCUMENT_TEXT_XLSX_ROW_LIMITATION,
  DOCUMENT_TEXT_XLSX_SHEET_LIMITATION,
} from '../document-text.constant.js';
import type { ExtractedDocumentText } from '../document-text.interface.js';

/**
 * Extracts worksheet text through the shared spreadsheet boundary.
 *
 * `xlsx` is deliberately not imported here. The spreadsheet adapter parses with
 * row limits and clamps the range before traversal, so this extractor only sees
 * already-bounded rows.
 */
export function extractXlsxText(
  spreadsheetService: SpreadsheetService,
  buffer: Buffer,
): ExtractedDocumentText {
  const result = spreadsheetService.readText(buffer, {
    maxSheets: DOCUMENT_TEXT_XLSX_MAX_SHEETS,
    maxRowsPerSheet: DOCUMENT_TEXT_XLSX_MAX_ROWS_PER_SHEET,
    maxColumnsPerSheet: DOCUMENT_TEXT_XLSX_MAX_COLUMNS_PER_SHEET,
    maxCellLength: DOCUMENT_TEXT_XLSX_MAX_CELL_CHARS,
  });

  const limitations: string[] = [DOCUMENT_TEXT_XLSX_MEDIA_LIMITATION];

  if (result.truncatedSheets) {
    limitations.push(DOCUMENT_TEXT_XLSX_SHEET_LIMITATION);
  }

  if (result.truncatedRows) {
    limitations.push(DOCUMENT_TEXT_XLSX_ROW_LIMITATION);
  }

  if (result.truncatedColumns) {
    limitations.push(DOCUMENT_TEXT_XLSX_COLUMN_LIMITATION);
  }

  if (result.truncatedCells) {
    limitations.push(DOCUMENT_TEXT_XLSX_CELL_LIMITATION);
  }

  const text = result.sheets
    .map((sheet) => [`Worksheet: ${sheet.name}`, ...sheet.rows].join('\n'))
    .join('\n\n');

  return { text, limitations };
}
