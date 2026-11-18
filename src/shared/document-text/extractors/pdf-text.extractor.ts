import { getDocumentProxy } from 'unpdf';
import {
  DOCUMENT_TEXT_PDF_MAX_PAGES,
  DOCUMENT_TEXT_PDF_NO_OCR_LIMITATION,
  DOCUMENT_TEXT_PDF_PAGE_LIMITATION,
} from '../document-text.constant.js';
import type { ExtractedDocumentText } from '../document-text.interface.js';

/**
 * Extracts PDF text page by page.
 *
 * `unpdf` exposes whole-document helpers, but they walk every page. The manual
 * loop stops at the approved page cap, so a 900-page upload cannot make the
 * request do 900 pages of work. Only text operators are read; nothing is
 * rendered, OCR'd, or fetched.
 */
export async function extractPdfText(
  buffer: Buffer,
): Promise<ExtractedDocumentText> {
  const limitations: string[] = [DOCUMENT_TEXT_PDF_NO_OCR_LIMITATION];
  const document = await getDocumentProxy(new Uint8Array(buffer), {
    // pdfjs logs warnings through console.warn; failures are logged by the
    // caller instead, so only hard errors are allowed through.
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
  });

  try {
    const pageCount = Math.min(document.numPages, DOCUMENT_TEXT_PDF_MAX_PAGES);

    if (document.numPages > DOCUMENT_TEXT_PDF_MAX_PAGES) {
      limitations.unshift(DOCUMENT_TEXT_PDF_PAGE_LIMITATION);
    }

    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);

      try {
        const content = await page.getTextContent();
        const pageText = joinTextItems(content.items);
        pages.push(pageText);
      } finally {
        page.cleanup();
      }
    }

    return {
      text: pages.join('\n\n'),
      limitations,
    };
  } finally {
    await document.loadingTask.destroy().catch(() => undefined);
  }
}

/**
 * Mirrors the text reconstruction unpdf uses: item strings concatenated, with
 * a newline where the PDF marks an end of line.
 */
function joinTextItems(items: readonly unknown[]): string {
  let text = '';

  for (const item of items) {
    if (typeof item !== 'object' || item === null || !('str' in item)) {
      continue;
    }

    const typed = item as { str?: unknown; hasEOL?: unknown };

    if (typeof typed.str === 'string') {
      text += typed.str;
    }

    if (typed.hasEOL === true) {
      text += '\n';
    }
  }

  return text;
}
