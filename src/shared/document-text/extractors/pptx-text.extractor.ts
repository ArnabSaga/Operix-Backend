import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import {
  DOCUMENT_TEXT_PPTX_MAX_CHARS_PER_SLIDE,
  DOCUMENT_TEXT_PPTX_MAX_SLIDES,
  DOCUMENT_TEXT_PPTX_MEDIA_LIMITATION,
  DOCUMENT_TEXT_PPTX_SLIDE_LIMITATION,
  DOCUMENT_TEXT_PPTX_TEXT_LIMITATION,
} from '../document-text.constant.js';
import type { ExtractedDocumentText } from '../document-text.interface.js';

const SLIDE_ENTRY_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;

/**
 * Extracts visible slide text from a PPTX package.
 *
 * Only `ppt/slides/slideN.xml` entries are read, and only the first allowed
 * slides. Embedded parts (media, notes, external relationships) are never
 * opened, so a crafted package cannot redirect extraction to another file.
 */
export async function extractPptxText(
  buffer: Buffer,
): Promise<ExtractedDocumentText> {
  const archive = await JSZip.loadAsync(buffer);
  const limitations: string[] = [DOCUMENT_TEXT_PPTX_MEDIA_LIMITATION];
  const slides = Object.keys(archive.files)
    .map((entryName) => {
      const match = SLIDE_ENTRY_PATTERN.exec(entryName);
      const index = match?.[1];

      if (index === undefined) {
        return null;
      }

      return { entryName, index: Number(index) };
    })
    .filter(
      (entry): entry is { entryName: string; index: number } => entry !== null,
    )
    .sort((left, right) => left.index - right.index);

  if (slides.length > DOCUMENT_TEXT_PPTX_MAX_SLIDES) {
    limitations.push(DOCUMENT_TEXT_PPTX_SLIDE_LIMITATION);
  }

  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: false,
  });
  const selectedSlides = slides.slice(0, DOCUMENT_TEXT_PPTX_MAX_SLIDES);
  const texts: string[] = [];
  let slideTextTruncated = false;

  for (const slide of selectedSlides) {
    const entry = archive.file(slide.entryName);

    if (!entry) {
      continue;
    }

    const xml = await entry.async('string');
    const parsed: unknown = parser.parse(xml);
    const parts: string[] = [];
    collectTextNodes(parsed, parts);

    let slideText = parts.join('').trim();

    if (slideText.length > DOCUMENT_TEXT_PPTX_MAX_CHARS_PER_SLIDE) {
      slideTextTruncated = true;
      slideText = slideText.slice(0, DOCUMENT_TEXT_PPTX_MAX_CHARS_PER_SLIDE);
    }

    if (slideText.length > 0) {
      texts.push(slideText);
    }
  }

  if (slideTextTruncated) {
    limitations.push(DOCUMENT_TEXT_PPTX_TEXT_LIMITATION);
  }

  return {
    text: texts.join('\n\n'),
    limitations,
  };
}

/**
 * Walks the parsed XML and collects only `a:t` text runs, in document order.
 * `a:br` becomes a newline so paragraphs do not collapse into one word.
 */
function collectTextNodes(node: unknown, output: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectTextNodes(item, output);
    }

    return;
  }

  if (typeof node !== 'object' || node === null) {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'a:t') {
      appendTextValue(value, output);
      continue;
    }

    if (key === 'a:br') {
      output.push('\n');
      continue;
    }

    collectTextNodes(value, output);
  }
}

function appendTextValue(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    output.push(value);
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendTextValue(item, output);
    }
  }
}
