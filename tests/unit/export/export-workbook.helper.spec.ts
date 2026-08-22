import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import { AppException } from '../../../src/shared/errors/app.exception';
import { textCell } from '../../../src/shared/spreadsheet/spreadsheet-write.helper';
import { EXPORT_LIMIT } from '../../../src/modules/export/export.constant';
import {
  assertWorkbookWithinExportLimits,
  headerRow,
  row,
} from '../../../src/modules/export/export-workbook.helper';

describe('export workbook helpers', () => {
  it('allows exactly the maximum data row count', () => {
    const workbook = {
      sheets: [
        {
          name: 'Rows',
          rows: [
            headerRow('Value'),
            ...Array.from({ length: EXPORT_LIMIT.MAX_ROWS_PER_SHEET }, () =>
              row(textCell('ok')),
            ),
          ],
        },
      ],
    };

    expect(() => assertWorkbookWithinExportLimits(workbook)).not.toThrow();
  });

  it('rejects data rows above the maximum before workbook generation', () => {
    const workbook = {
      sheets: [
        {
          name: 'Rows',
          rows: [
            headerRow('Value'),
            ...Array.from({ length: EXPORT_LIMIT.MAX_ROWS_PER_SHEET + 1 }, () =>
              row(textCell('too many')),
            ),
          ],
        },
      ],
    };

    expect(() => assertWorkbookWithinExportLimits(workbook)).toThrow(
      AppException,
    );

    try {
      assertWorkbookWithinExportLimits(workbook);
    } catch (error) {
      expect((error as AppException).getResponse()).toMatchObject({
        code: APP_ERROR_CODE.EXPORT_LIMIT_EXCEEDED,
      });
    }
  });

  it('allows exactly the maximum total cell count', () => {
    const workbook = {
      sheets: [
        {
          name: 'Cells',
          rows: [
            Array.from({ length: 25 }, () => textCell('header')),
            ...Array.from({ length: 9_999 }, () =>
              Array.from({ length: 25 }, () => textCell('value')),
            ),
          ],
        },
      ],
    };

    expect(() => assertWorkbookWithinExportLimits(workbook)).not.toThrow();
  });

  it('rejects total cells above the maximum before workbook generation', () => {
    const workbook = {
      sheets: [
        {
          name: 'Cells',
          rows: [
            Array.from({ length: 25 }, () => textCell('header')),
            ...Array.from({ length: 10_000 }, () =>
              Array.from({ length: 25 }, () => textCell('value')),
            ),
          ],
        },
      ],
    };

    try {
      assertWorkbookWithinExportLimits(workbook);
    } catch (error) {
      expect((error as AppException).getResponse()).toMatchObject({
        code: APP_ERROR_CODE.EXPORT_LIMIT_EXCEEDED,
      });
      return;
    }

    throw new Error('Expected export cell limit to fail.');
  });

  it('rejects oversized text cells before workbook generation', () => {
    expect(() => textCell('x'.repeat(32_768))).toThrow(AppException);

    try {
      textCell('x'.repeat(32_768));
    } catch (error) {
      expect((error as AppException).getResponse()).toMatchObject({
        code: APP_ERROR_CODE.EXPORT_CELL_VALUE_TOO_LARGE,
      });
    }
  });
});
