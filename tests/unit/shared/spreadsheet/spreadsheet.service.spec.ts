import { read, utils, write } from 'xlsx';
import { SheetJsSpreadsheetAdapter } from '../../../../src/shared/spreadsheet/adapters/sheetjs-spreadsheet.adapter';
import { toSafeSpreadsheetText } from '../../../../src/shared/spreadsheet/spreadsheet-formula.guard';
import {
  dateCell,
  numberCell,
  textCell,
} from '../../../../src/shared/spreadsheet/spreadsheet-write.helper';
import { SpreadsheetService } from '../../../../src/shared/spreadsheet/spreadsheet.service';

describe('SpreadsheetService', () => {
  it('parses xlsx buffers into neutral workbook cells with coordinates and formulas', () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ['Employee ID', 'Email'],
      ['EMP-001', { f: 'CONCAT("x","@example.com")', v: 'x@example.com' }],
    ]);
    sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    utils.book_append_sheet(workbook, sheet, 'Members');
    workbook.Workbook = {
      Sheets: [{ name: 'Members', Hidden: 1 }],
    };

    const buffer = write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;
    const service = new SpreadsheetService(new SheetJsSpreadsheetAdapter());
    const parsed = service.parse(buffer);

    expect(parsed.metadata.sheetNames).toEqual(['Members']);
    expect(parsed.sheets[0]).toMatchObject({
      name: 'Members',
      hidden: true,
      rowCount: 2,
      columnCount: 2,
      merges: [
        {
          startRow: 1,
          startColumn: 1,
          endRow: 1,
          endColumn: 2,
          address: 'A1:B1',
        },
      ],
    });
    expect(parsed.sheets[0]?.rows[1]?.cells[1]).toMatchObject({
      row: 2,
      column: 2,
      address: 'B2',
      value: 'x@example.com',
      formula: 'CONCAT("x","@example.com")',
      hasFormula: true,
    });
  });

  it('writes xlsx buffers', () => {
    const service = new SpreadsheetService(new SheetJsSpreadsheetAdapter());
    const buffer = service.write({
      sheets: [
        {
          name: 'Summary',
          rows: [[{ value: 'Can Import' }, { value: 'true' }]],
        },
      ],
    });
    const workbook = read(buffer, { type: 'buffer' });

    expect(workbook.SheetNames).toEqual(['Summary']);
  });

  it('protects spreadsheet text from formula injection', () => {
    expect(toSafeSpreadsheetText('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(toSafeSpreadsheetText('   =HYPERLINK("x")')).toBe(
      '\'   =HYPERLINK("x")',
    );
    expect(toSafeSpreadsheetText('\t@SUM(A1:A2)')).toBe("'\t@SUM(A1:A2)");
    expect(toSafeSpreadsheetText('plain text')).toBe('plain text');
  });

  it('writes dangerous text as safe strings with no formulas after an xlsx round trip', () => {
    const service = new SpreadsheetService(new SheetJsSpreadsheetAdapter());
    const dangerousValues = [
      '=SUM(A1:A2)',
      '+CMD',
      '-TEST',
      '@SUM(A1:A2)',
      '    =HYPERLINK("x")',
      '\t=HYPERLINK("x")',
    ];

    const buffer = service.write({
      sheets: [
        {
          name: 'Dangerous Text',
          rows: [dangerousValues.map((value) => textCell(value))],
        },
      ],
    });
    const parsed = service.parse(buffer);
    const cells = parsed.sheets[0]?.rows[0]?.cells ?? [];

    expect(cells.map((cell) => cell.formula)).toEqual(
      dangerousValues.map(() => undefined),
    );
    expect(cells.map((cell) => cell.value)).toEqual(
      dangerousValues.map((value) => `'${value}`),
    );
    expect(cells.map((cell) => cell.cellType)).toEqual(
      dangerousValues.map(() => 's'),
    );
  });

  it('keeps genuine negative numbers numeric through an xlsx round trip', () => {
    const service = new SpreadsheetService(new SheetJsSpreadsheetAdapter());
    const buffer = service.write({
      sheets: [
        {
          name: 'Numbers',
          rows: [[numberCell(-5), numberCell(-125.5)]],
        },
      ],
    });
    const parsed = service.parse(buffer);
    const cells = parsed.sheets[0]?.rows[0]?.cells ?? [];

    expect(cells[0]).toMatchObject({ value: -5, cellType: 'n' });
    expect(cells[1]).toMatchObject({ value: -125.5, cellType: 'n' });
  });

  it('preserves UTC date instants through an xlsx round trip', () => {
    const service = new SpreadsheetService(new SheetJsSpreadsheetAdapter());
    const date = new Date('2026-08-23T00:00:00.000Z');
    const buffer = service.write({
      sheets: [
        {
          name: 'Dates',
          rows: [[dateCell(date)]],
        },
      ],
    });
    const parsed = service.parse(buffer);
    const value = parsed.sheets[0]?.rows[0]?.cells[0]?.value;

    expect(value).toBeInstanceOf(Date);
    expect((value as Date).getTime()).toBe(date.getTime());
  });
});
