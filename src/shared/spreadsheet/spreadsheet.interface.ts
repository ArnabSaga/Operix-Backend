export interface SpreadsheetWorkbook {
  sheets: SpreadsheetSheet[];
  metadata: {
    sheetNames: string[];
  };
}

export interface SpreadsheetSheet {
  name: string;
  hidden: boolean;
  rowCount: number;
  columnCount: number;
  merges: SpreadsheetMerge[];
  rows: SpreadsheetRow[];
}

export interface SpreadsheetRow {
  row: number;
  cells: SpreadsheetCell[];
}

export interface SpreadsheetCell {
  row: number;
  column: number;
  address: string;
  value: unknown;
  rawValue: unknown;
  formattedValue?: string;
  formula?: string;
  hasFormula: boolean;
  cellType: string;
}

export interface SpreadsheetMerge {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
  address: string;
}

export interface SpreadsheetWriteWorkbook {
  sheets: SpreadsheetWriteSheet[];
}

export interface SpreadsheetWriteSheet {
  name: string;
  rows: SpreadsheetWriteRow[];
}

export type SpreadsheetWriteRow = SpreadsheetWriteCell[];

export interface SpreadsheetWriteCell {
  value: string | number | boolean | Date | null;
}

export interface SpreadsheetTextLimits {
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
  maxCellLength: number;
}

export interface SpreadsheetTextSheet {
  name: string;
  rows: string[];
}

/**
 * Bounded text view of a workbook. Unlike `SpreadsheetWorkbook`, this never
 * expands the full `!ref` range, so a crafted sheet cannot force a huge
 * allocation just by declaring a far-away cell.
 */
export interface SpreadsheetTextResult {
  sheets: SpreadsheetTextSheet[];
  totalSheets: number;
  truncatedSheets: boolean;
  truncatedRows: boolean;
  truncatedColumns: boolean;
  truncatedCells: boolean;
}

export interface SpreadsheetAdapter {
  parse(buffer: Buffer): SpreadsheetWorkbook;
  readText(
    buffer: Buffer,
    limits: SpreadsheetTextLimits,
  ): SpreadsheetTextResult;
  write(workbook: SpreadsheetWriteWorkbook): Buffer;
}
