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

export interface SpreadsheetAdapter {
  parse(buffer: Buffer): SpreadsheetWorkbook;
  write(workbook: SpreadsheetWriteWorkbook): Buffer;
}
