import {
  DOCUMENT_TEXT_DOCX_MEDIA_LIMITATION,
  DOCUMENT_TEXT_GLOBAL_TRUNCATION_LIMITATION,
  DOCUMENT_TEXT_MAX_CHARS,
  DOCUMENT_TEXT_PDF_NO_OCR_LIMITATION,
  DOCUMENT_TEXT_PDF_PAGE_LIMITATION,
  DOCUMENT_TEXT_PPTX_MEDIA_LIMITATION,
  DOCUMENT_TEXT_PPTX_SLIDE_LIMITATION,
  DOCUMENT_TEXT_PPTX_TEXT_LIMITATION,
  DOCUMENT_TEXT_XLSX_CELL_LIMITATION,
  DOCUMENT_TEXT_XLSX_COLUMN_LIMITATION,
  DOCUMENT_TEXT_XLSX_MEDIA_LIMITATION,
  DOCUMENT_TEXT_XLSX_ROW_LIMITATION,
  DOCUMENT_TEXT_XLSX_SHEET_LIMITATION,
} from '../../../../src/shared/document-text/document-text.constant';
import {
  DocumentTextService,
  normalizeDocumentText,
} from '../../../../src/shared/document-text/document-text.service';
import { APP_ERROR_CODE } from '../../../../src/shared/errors/app-error-code.constant';
import { AppException } from '../../../../src/shared/errors/app.exception';
import { SheetJsSpreadsheetAdapter } from '../../../../src/shared/spreadsheet/adapters/sheetjs-spreadsheet.adapter';
import { SpreadsheetService } from '../../../../src/shared/spreadsheet/spreadsheet.service';
import {
  buildDocxFixture,
  buildPdfFixture,
  buildPptxFixture,
  buildXlsxFixture,
} from '../../../support/fixtures/document-file.fixtures';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function createService(): DocumentTextService {
  return new DocumentTextService(
    new SpreadsheetService(new SheetJsSpreadsheetAdapter()),
  );
}

async function captureError(action: Promise<unknown>): Promise<AppException> {
  const error: unknown = await action.then(
    () => null,
    (reason: unknown) => reason,
  );

  expect(error).toBeInstanceOf(AppException);

  return error as AppException;
}

function expectAppError(
  error: AppException,
  status: number,
  code: string,
): void {
  expect(error.getStatus()).toBe(status);
  expect(error.getResponse()).toMatchObject({ code });
}

describe('DocumentTextService', () => {
  describe('format support', () => {
    it('supports PDF, DOCX, XLSX and PPTX only', () => {
      const service = createService();

      expect(service.isSupported(PDF_MIME)).toBe(true);
      expect(service.isSupported(DOCX_MIME)).toBe(true);
      expect(service.isSupported(XLSX_MIME)).toBe(true);
      expect(service.isSupported(PPTX_MIME)).toBe(true);
      expect(service.isSupported('image/png')).toBe(false);
      expect(service.isSupported('image/jpeg')).toBe(false);
      expect(service.isSupported('text/plain')).toBe(false);
    });

    it('rejects an unsupported format before any parsing', async () => {
      const error = await captureError(
        createService().extract(Buffer.from('image bytes'), 'image/png'),
      );

      expectAppError(error, 415, APP_ERROR_CODE.DOCUMENT_AI_UNSUPPORTED_FORMAT);
    });
  });

  describe('PDF', () => {
    it('extracts text from every page and explains the no-OCR caveat', async () => {
      const buffer = buildPdfFixture([
        'Operix batch record review document text.',
        'Second page covering deviations and corrective actions.',
      ]);
      const result = await createService().extract(buffer, PDF_MIME);

      expect(result.format).toBe('PDF');
      expect(result.text).toContain('Operix batch record review');
      expect(result.text).toContain('Second page covering deviations');
      expect(result.limitations).toContain(DOCUMENT_TEXT_PDF_NO_OCR_LIMITATION);
      expect(result.limitations).not.toContain(
        DOCUMENT_TEXT_PDF_PAGE_LIMITATION,
      );
    });

    it('stops at 50 pages and says only those pages were analysed', async () => {
      const pages = Array.from(
        { length: 51 },
        (_, index) =>
          `Page ${index + 1} of the controlled document with enough text.`,
      );
      const result = await createService().extract(
        buildPdfFixture(pages),
        PDF_MIME,
      );

      expect(result.text).toContain('Page 50 of the controlled document');
      expect(result.text).not.toContain('Page 51 of the controlled document');
      expect(result.limitations).toContain(DOCUMENT_TEXT_PDF_PAGE_LIMITATION);
    });

    it('treats a sparse PDF as having no usable text', async () => {
      const error = await captureError(
        createService().extract(buildPdfFixture(['short']), PDF_MIME),
      );

      expectAppError(error, 422, APP_ERROR_CODE.DOCUMENT_TEXT_EMPTY);
    });

    it('maps a corrupt PDF to a safe extraction failure', async () => {
      const error = await captureError(
        createService().extract(
          Buffer.from('%PDF-1.4 this is not a real document'),
          PDF_MIME,
        ),
      );

      expectAppError(
        error,
        422,
        APP_ERROR_CODE.DOCUMENT_TEXT_EXTRACTION_FAILED,
      );
      expect(error.message).toBe('The document text could not be extracted.');
      expect(error.message).not.toContain('xref');
    });
  });

  describe('DOCX', () => {
    it('extracts paragraph text and explains that media is excluded', async () => {
      const buffer = await buildDocxFixture([
        'Operix document paragraph one.',
        'Second paragraph with an action item for the quality team.',
      ]);
      const result = await createService().extract(buffer, DOCX_MIME);

      expect(result.format).toBe('DOCX');
      expect(result.text).toContain('Operix document paragraph one.');
      expect(result.text).toContain('Second paragraph with an action item');
      expect(result.limitations).toEqual([DOCUMENT_TEXT_DOCX_MEDIA_LIMITATION]);
    });

    it('caps the total text that reaches the model', async () => {
      const buffer = await buildDocxFixture(['A'.repeat(70_000)]);
      const result = await createService().extract(buffer, DOCX_MIME);

      expect(result.text).toHaveLength(DOCUMENT_TEXT_MAX_CHARS);
      expect(result.limitations).toContain(
        DOCUMENT_TEXT_GLOBAL_TRUNCATION_LIMITATION,
      );
    });

    it('maps a non-DOCX payload to a safe extraction failure', async () => {
      const error = await captureError(
        createService().extract(buildPdfFixture(['PDF bytes']), DOCX_MIME),
      );

      expectAppError(
        error,
        422,
        APP_ERROR_CODE.DOCUMENT_TEXT_EXTRACTION_FAILED,
      );
    });
  });

  describe('XLSX', () => {
    it('extracts bounded worksheet text and reports each structural cap', async () => {
      const longCell = 'x'.repeat(300);
      const cappedRows = Array.from({ length: 250 }, (_, rowIndex) =>
        Array.from({ length: 25 }, (_, columnIndex) =>
          rowIndex === 0 && columnIndex === 0
            ? longCell
            : `R${rowIndex + 1}C${columnIndex + 1}`,
        ),
      );
      const sheets = Array.from({ length: 11 }, (_, sheetIndex) => ({
        name: `Sheet${sheetIndex + 1}`,
        rows:
          sheetIndex === 0
            ? cappedRows
            : [[`Content of sheet ${sheetIndex + 1}`]],
      }));
      const result = await createService().extract(
        buildXlsxFixture(sheets),
        XLSX_MIME,
      );

      expect(result.format).toBe('XLSX');
      expect(result.text).toContain('Worksheet: Sheet1');
      expect(result.text).toContain('Worksheet: Sheet10');
      expect(result.text).not.toContain('Worksheet: Sheet11');
      expect(result.text).toContain('R200C1');
      expect(result.text).not.toContain('R201C1');
      expect(result.text).toContain('R1C20');
      expect(result.text).not.toContain('R1C21');
      expect(result.text).not.toContain('x'.repeat(201));
      expect(result.limitations).toEqual(
        expect.arrayContaining([
          DOCUMENT_TEXT_XLSX_MEDIA_LIMITATION,
          DOCUMENT_TEXT_XLSX_SHEET_LIMITATION,
          DOCUMENT_TEXT_XLSX_ROW_LIMITATION,
          DOCUMENT_TEXT_XLSX_COLUMN_LIMITATION,
          DOCUMENT_TEXT_XLSX_CELL_LIMITATION,
        ]),
      );
    });

    it('rejects a workbook with no text as empty', async () => {
      const error = await captureError(
        createService().extract(
          buildXlsxFixture([{ name: 'Empty', rows: [] }]),
          XLSX_MIME,
        ),
      );

      expectAppError(error, 422, APP_ERROR_CODE.DOCUMENT_TEXT_EMPTY);
    });

    it('maps corrupt workbook bytes to a safe extraction failure', async () => {
      const error = await captureError(
        createService().extract(
          Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]),
          XLSX_MIME,
        ),
      );

      expectAppError(
        error,
        422,
        APP_ERROR_CODE.DOCUMENT_TEXT_EXTRACTION_FAILED,
      );
    });
  });

  describe('PPTX', () => {
    it('extracts slide text and excludes media by default', async () => {
      const result = await createService().extract(
        await buildPptxFixture([
          'Operix quality review slide.',
          'Second slide with a CAPA deadline.',
        ]),
        PPTX_MIME,
      );

      expect(result.format).toBe('PPTX');
      expect(result.text).toContain('Operix quality review slide.');
      expect(result.text).toContain('Second slide with a CAPA deadline.');
      expect(result.limitations).toContain(DOCUMENT_TEXT_PPTX_MEDIA_LIMITATION);
      expect(result.limitations).not.toContain(
        DOCUMENT_TEXT_PPTX_SLIDE_LIMITATION,
      );
    });

    it('caps slide count and per-slide text', async () => {
      const slides = Array.from(
        { length: 41 },
        (_, index) =>
          `Slide ${index + 1} ${index === 0 ? 'y'.repeat(5_000) : 'content'}`,
      );
      const result = await createService().extract(
        await buildPptxFixture(slides),
        PPTX_MIME,
      );

      expect(result.text).toContain('Slide 40 content');
      expect(result.text).not.toContain('Slide 41 content');
      expect(result.limitations).toContain(DOCUMENT_TEXT_PPTX_SLIDE_LIMITATION);
      expect(result.limitations).toContain(DOCUMENT_TEXT_PPTX_TEXT_LIMITATION);
    });

    it('rejects a package with no slide text as empty', async () => {
      const error = await captureError(
        createService().extract(await buildPptxFixture(['']), PPTX_MIME),
      );

      expectAppError(error, 422, APP_ERROR_CODE.DOCUMENT_TEXT_EMPTY);
    });

    it('maps a non-ZIP payload to a safe extraction failure', async () => {
      const error = await captureError(
        createService().extract(Buffer.from('not a zip'), PPTX_MIME),
      );

      expectAppError(
        error,
        422,
        APP_ERROR_CODE.DOCUMENT_TEXT_EXTRACTION_FAILED,
      );
    });
  });

  describe('normalisation', () => {
    it('removes null bytes, normalises line endings and collapses whitespace', () => {
      expect(normalizeDocumentText('  A\r\nB\t\tC\u0000 \n\n\n D  ')).toBe(
        'A\nB C\n\nD',
      );
    });
  });
});
