import { Injectable } from '@nestjs/common';
import {
  read,
  utils,
  write,
  type CellObject,
  type WorkBook,
  type WorkSheet,
} from 'xlsx';
import type {
  SpreadsheetAdapter,
  SpreadsheetCell,
  SpreadsheetMerge,
  SpreadsheetRow,
  SpreadsheetTextLimits,
  SpreadsheetTextResult,
  SpreadsheetTextSheet,
  SpreadsheetWorkbook,
  SpreadsheetWriteWorkbook,
} from '../spreadsheet.interface.js';

@Injectable()
export class SheetJsSpreadsheetAdapter implements SpreadsheetAdapter {
  parse(buffer: Buffer): SpreadsheetWorkbook {
    const workbook = read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellFormula: true,
      cellNF: true,
      cellText: true,
      WTF: false,
    });

    const sheets = workbook.SheetNames.map((sheetName, index) =>
      mapSheet(workbook, sheetName, index),
    );

    return {
      sheets,
      metadata: {
        sheetNames: workbook.SheetNames,
      },
    };
  }

  /**
   * Bounded worksheet text extraction.
   *
   * `sheetRows` stops SheetJS after the first allowed row, and the traversal
   * clamps the decoded range before touching cells, so neither a huge row
   * count nor a far-away column reference expands into a large allocation.
   */
  readText(
    buffer: Buffer,
    limits: SpreadsheetTextLimits,
  ): SpreadsheetTextResult {
    const workbook = read(buffer, {
      type: 'buffer',
      sheetRows: limits.maxRowsPerSheet + 1,
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellNF: false,
      cellText: true,
      bookVBA: false,
      WTF: false,
    });

    const totalSheets = workbook.SheetNames.length;
    const selectedSheets = workbook.SheetNames.slice(0, limits.maxSheets);
    const sheets: SpreadsheetTextSheet[] = [];
    let truncatedRows = false;
    let truncatedColumns = false;
    let truncatedCells = false;

    for (const sheetName of selectedSheets) {
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        continue;
      }

      const ref = worksheet['!ref'];
      const range = ref
        ? utils.decode_range(ref)
        : {
            s: { r: 0, c: 0 },
            e: { r: -1, c: -1 },
          };

      if (range.e.r < range.s.r || range.e.c < range.s.c) {
        continue;
      }

      if (range.e.r - range.s.r + 1 > limits.maxRowsPerSheet) {
        truncatedRows = true;
      }

      if (range.e.c - range.s.c + 1 > limits.maxColumnsPerSheet) {
        truncatedColumns = true;
      }

      const lastRow = Math.min(
        range.e.r,
        range.s.r + limits.maxRowsPerSheet - 1,
      );
      const lastColumn = Math.min(
        range.e.c,
        range.s.c + limits.maxColumnsPerSheet - 1,
      );
      const rows: string[] = [];

      for (let rowIndex = range.s.r; rowIndex <= lastRow; rowIndex += 1) {
        const values: string[] = [];

        for (
          let columnIndex = range.s.c;
          columnIndex <= lastColumn;
          columnIndex += 1
        ) {
          const address = utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell = worksheet[address] as CellObject | undefined;
          const value = formatTextCell(cell);

          if (value.length === 0) {
            continue;
          }

          if (value.length > limits.maxCellLength) {
            truncatedCells = true;
            values.push(value.slice(0, limits.maxCellLength));
          } else {
            values.push(value);
          }
        }

        if (values.length > 0) {
          rows.push(values.join(' | '));
        }
      }

      if (rows.length > 0) {
        sheets.push({ name: sheetName, rows });
      }
    }

    return {
      sheets,
      totalSheets,
      truncatedSheets: totalSheets > limits.maxSheets,
      truncatedRows,
      truncatedColumns,
      truncatedCells,
    };
  }

  write(workbook: SpreadsheetWriteWorkbook): Buffer {
    const output = utils.book_new();

    for (const sheet of workbook.sheets) {
      const rows = sheet.rows.map((row) =>
        row.map((cell) => toSheetJsWriteValue(cell.value)),
      );
      const worksheet = utils.aoa_to_sheet(rows);
      utils.book_append_sheet(output, worksheet, sheet.name);
    }

    return write(output, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;
  }
}

function toSheetJsWriteValue(value: unknown): unknown {
  if (value instanceof Date) {
    return new Date(value.getTime() + value.getTimezoneOffset() * 60_000);
  }

  return value;
}

/**
 * Converts one cell to a single line of text. Formatted text is preferred so
 * dates and percentages read the way the worksheet displays them.
 */
function formatTextCell(cell: CellObject | undefined): string {
  if (!cell) {
    return '';
  }

  if (typeof cell.w === 'string') {
    return singleLine(cell.w);
  }

  if (cell.v instanceof Date) {
    return singleLine(cell.v.toISOString());
  }

  if (
    typeof cell.v === 'string' ||
    typeof cell.v === 'number' ||
    typeof cell.v === 'boolean'
  ) {
    return singleLine(String(cell.v));
  }

  return '';
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function mapSheet(
  workbook: WorkBook,
  sheetName: string,
  sheetIndex: number,
): SpreadsheetWorkbook['sheets'][number] {
  const worksheet = workbook.Sheets[sheetName];
  const ref = worksheet?.['!ref'];
  const range = ref
    ? utils.decode_range(ref)
    : {
        s: { r: 0, c: 0 },
        e: { r: -1, c: -1 },
      };
  const rowCount = range.e.r >= range.s.r ? range.e.r - range.s.r + 1 : 0;
  const columnCount = range.e.c >= range.s.c ? range.e.c - range.s.c + 1 : 0;

  return {
    name: sheetName,
    hidden: Boolean(workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden),
    rowCount,
    columnCount,
    merges: mapMerges(worksheet),
    rows: mapRows(worksheet, range),
  };
}

function mapRows(
  worksheet: WorkSheet | undefined,
  range: ReturnType<typeof utils.decode_range>,
): SpreadsheetRow[] {
  if (!worksheet || range.e.r < range.s.r || range.e.c < range.s.c) {
    return [];
  }

  const rows: SpreadsheetRow[] = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const cells: SpreadsheetCell[] = [];

    for (
      let columnIndex = range.s.c;
      columnIndex <= range.e.c;
      columnIndex += 1
    ) {
      const address = utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address] as CellObject | undefined;

      cells.push({
        row: rowIndex + 1,
        column: columnIndex + 1,
        address,
        value: cell?.v ?? null,
        rawValue: cell?.v ?? null,
        formattedValue: cell?.w,
        formula: cell?.f,
        hasFormula: typeof cell?.f === 'string' && cell.f.length > 0,
        cellType: cell?.t ?? 'blank',
      });
    }

    rows.push({
      row: rowIndex + 1,
      cells,
    });
  }

  return rows;
}

function mapMerges(worksheet: WorkSheet | undefined): SpreadsheetMerge[] {
  return (worksheet?.['!merges'] ?? []).map((merge) => ({
    startRow: merge.s.r + 1,
    startColumn: merge.s.c + 1,
    endRow: merge.e.r + 1,
    endColumn: merge.e.c + 1,
    address: utils.encode_range(merge),
  }));
}
