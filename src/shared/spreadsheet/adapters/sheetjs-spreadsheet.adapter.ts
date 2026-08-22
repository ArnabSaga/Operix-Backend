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

  write(workbook: SpreadsheetWriteWorkbook): Buffer {
    const output = utils.book_new();

    for (const sheet of workbook.sheets) {
      const rows = sheet.rows.map((row) => row.map((cell) => cell.value));
      const worksheet = utils.aoa_to_sheet(rows);
      utils.book_append_sheet(output, worksheet, sheet.name);
    }

    return write(output, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;
  }
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
