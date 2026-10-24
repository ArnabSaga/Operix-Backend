/**
 * Step 31 document intelligence limits.
 *
 * The global character cap is the hard ceiling that reaches the model. The
 * per-format caps exist so a single hostile or pathological file cannot force
 * unbounded parsing or allocation before that ceiling applies.
 */
export const DOCUMENT_TEXT_MAX_CHARS = 60_000;

export const DOCUMENT_TEXT_PDF_MAX_PAGES = 50;

/**
 * A PDF whose extractable text is shorter than this is treated as having no
 * usable text. Scanned documents and image-only pages land here.
 */
export const DOCUMENT_TEXT_PDF_MIN_USABLE_CHARS = 50;

export const DOCUMENT_TEXT_XLSX_MAX_SHEETS = 10;
export const DOCUMENT_TEXT_XLSX_MAX_ROWS_PER_SHEET = 200;
export const DOCUMENT_TEXT_XLSX_MAX_COLUMNS_PER_SHEET = 20;
export const DOCUMENT_TEXT_XLSX_MAX_CELL_CHARS = 200;

export const DOCUMENT_TEXT_PPTX_MAX_SLIDES = 40;
export const DOCUMENT_TEXT_PPTX_MAX_CHARS_PER_SLIDE = 4_000;

export const DOCUMENT_TEXT_GLOBAL_TRUNCATION_LIMITATION = `Document text was truncated to the first ${DOCUMENT_TEXT_MAX_CHARS.toLocaleString('en-US')} characters for analysis.`;

export const DOCUMENT_TEXT_PDF_PAGE_LIMITATION = `Only the first ${DOCUMENT_TEXT_PDF_MAX_PAGES} pages of this PDF were analyzed.`;

export const DOCUMENT_TEXT_PDF_NO_OCR_LIMITATION =
  'Scanned or image-only PDF content was not OCR processed, so text visible only inside images may be missing.';

export const DOCUMENT_TEXT_DOCX_MEDIA_LIMITATION =
  'Only document text was analyzed. Images, diagrams, and other embedded media were not analyzed.';

export const DOCUMENT_TEXT_XLSX_MEDIA_LIMITATION =
  'Only worksheet cell text was analyzed. Charts, images, macros, and the visual meaning of formulas were not analyzed.';

export const DOCUMENT_TEXT_XLSX_SHEET_LIMITATION = `Only the first ${DOCUMENT_TEXT_XLSX_MAX_SHEETS} worksheets of this workbook were analyzed.`;

export const DOCUMENT_TEXT_XLSX_ROW_LIMITATION = `Only the first ${DOCUMENT_TEXT_XLSX_MAX_ROWS_PER_SHEET} rows of each worksheet were analyzed.`;

export const DOCUMENT_TEXT_XLSX_COLUMN_LIMITATION = `Only the first ${DOCUMENT_TEXT_XLSX_MAX_COLUMNS_PER_SHEET} columns of each worksheet row were analyzed.`;

export const DOCUMENT_TEXT_XLSX_CELL_LIMITATION = `Long worksheet cell values were truncated to ${DOCUMENT_TEXT_XLSX_MAX_CELL_CHARS} characters.`;

export const DOCUMENT_TEXT_PPTX_SLIDE_LIMITATION = `Only the first ${DOCUMENT_TEXT_PPTX_MAX_SLIDES} slides of this presentation were analyzed.`;

export const DOCUMENT_TEXT_PPTX_TEXT_LIMITATION = `Slide text was truncated to ${DOCUMENT_TEXT_PPTX_MAX_CHARS_PER_SLIDE.toLocaleString('en-US')} characters per slide.`;

export const DOCUMENT_TEXT_PPTX_MEDIA_LIMITATION =
  'Only slide text was analyzed. Images, charts, speaker notes, audio, video, and other embedded media were not analyzed.';
