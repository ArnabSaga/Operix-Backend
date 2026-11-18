import JSZip from 'jszip';
import { utils, write } from 'xlsx';

/**
 * Deterministic binary fixtures for document extraction tests.
 *
 * These builders produce the smallest files the real parsers accept, so tests
 * do not depend on committed binaries. Nothing here is used at runtime.
 */

/** Minimal single-font PDF with one text line per page. */
export function buildPdfFixture(pages: readonly string[]): Buffer {
  const pageCount = Math.max(pages.length, 1);
  const fontObjectNumber = 3 + pageCount * 2;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from(
      { length: pageCount },
      (_, index) => `${3 + index * 2} 0 R`,
    ).join(' ')}] /Count ${pageCount} >>`,
  ];

  for (let index = 0; index < pageCount; index += 1) {
    const stream = `BT /F1 18 Tf 72 720 Td (${escapePdfText(
      pages[index] ?? '',
    )}) Tj ET`;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> ` +
        `/Contents ${4 + index * 2} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
  }

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/** Minimal DOCX package: one paragraph per supplied string. */
export async function buildDocxFixture(
  paragraphs: readonly string[],
): Promise<Buffer> {
  const body = paragraphs
    .map(
      (paragraph) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(
          paragraph,
        )}</w:t></w:r></w:p>`,
    )
    .join('');

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}</w:body>` +
    '</w:document>';

  return buildZipFixture({ 'word/document.xml': documentXml });
}

/** Minimal PPTX package: one text run per supplied slide. */
export async function buildPptxFixture(
  slides: readonly string[],
): Promise<Buffer> {
  const entries: Record<string, string> = {};

  slides.forEach((text, index) => {
    entries[`ppt/slides/slide${index + 1}.xml`] =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r>' +
      `<a:t>${escapeXml(text)}</a:t>` +
      '</a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
  });

  return buildZipFixture(entries);
}

/** Real XLSX bytes from a row matrix. */
export function buildXlsxFixture(
  sheets: readonly { name: string; rows: unknown[][] }[],
): Buffer {
  const workbook = utils.book_new();

  for (const sheet of sheets) {
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet(sheet.rows),
      sheet.name,
    );
  }

  return write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export async function buildZipFixture(
  entries: Readonly<Record<string, string>>,
): Promise<Buffer> {
  const archive = new JSZip();

  for (const [name, content] of Object.entries(entries)) {
    archive.file(name, content);
  }

  return archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
