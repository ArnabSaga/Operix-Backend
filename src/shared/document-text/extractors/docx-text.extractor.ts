import mammoth from 'mammoth';
import { DOCUMENT_TEXT_DOCX_MEDIA_LIMITATION } from '../document-text.constant.js';
import type { ExtractedDocumentText } from '../document-text.interface.js';

/**
 * Extracts raw DOCX text through Mammoth.
 *
 * `extractRawText` reads the document part and emits plain text. It never
 * converts to HTML and never resolves embedded media, so Mammoth's external
 * file access path is unreachable here. The output is not HTML-interpreted.
 */
export async function extractDocxText(
  buffer: Buffer,
): Promise<ExtractedDocumentText> {
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: result.value,
    limitations: [DOCUMENT_TEXT_DOCX_MEDIA_LIMITATION],
  };
}
