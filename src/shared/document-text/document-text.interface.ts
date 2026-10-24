export type DocumentTextFormat = 'PDF' | 'DOCX' | 'XLSX' | 'PPTX';

export const DOCUMENT_TEXT_FORMAT_BY_MIME_TYPE: Readonly<
  Record<string, DocumentTextFormat>
> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'PPTX',
};

/** Plain extraction result before global normalisation and truncation. */
export interface ExtractedDocumentText {
  text: string;
  limitations: string[];
}

/** Normalised text ready to be placed inside the AI prompt. */
export interface DocumentTextExtraction {
  format: DocumentTextFormat;
  text: string;
  limitations: string[];
}
