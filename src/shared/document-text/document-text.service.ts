import { HttpStatus, Injectable } from '@nestjs/common';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import { SpreadsheetService } from '../spreadsheet/spreadsheet.service.js';
import {
  DOCUMENT_TEXT_GLOBAL_TRUNCATION_LIMITATION,
  DOCUMENT_TEXT_MAX_CHARS,
  DOCUMENT_TEXT_PDF_MIN_USABLE_CHARS,
} from './document-text.constant.js';
import type {
  DocumentTextExtraction,
  DocumentTextFormat,
  ExtractedDocumentText,
} from './document-text.interface.js';
import { DOCUMENT_TEXT_FORMAT_BY_MIME_TYPE } from './document-text.interface.js';
import { extractDocxText } from './extractors/docx-text.extractor.js';
import { extractPdfText } from './extractors/pdf-text.extractor.js';
import { extractPptxText } from './extractors/pptx-text.extractor.js';
import { extractXlsxText } from './extractors/xlsx-text.extractor.js';

/**
 * Turns an authorised supported document into bounded plain text.
 *
 * This service knows nothing about users, Document scope, or the AI provider.
 * It receives bytes that the caller already authorized and returns text plus
 * the deterministic limitations that describe how that text was reduced.
 */
@Injectable()
export class DocumentTextService {
  constructor(private readonly spreadsheetService: SpreadsheetService) {}

  isSupported(mimeType: string): boolean {
    return DOCUMENT_TEXT_FORMAT_BY_MIME_TYPE[mimeType] !== undefined;
  }

  async extract(
    buffer: Buffer,
    mimeType: string,
  ): Promise<DocumentTextExtraction> {
    const format = DOCUMENT_TEXT_FORMAT_BY_MIME_TYPE[mimeType];

    if (format === undefined) {
      throw new AppException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        APP_ERROR_CODE.DOCUMENT_AI_UNSUPPORTED_FORMAT,
        'This document format is not supported for AI analysis.',
      );
    }

    const extracted = await this.runExtractor(format, buffer);
    const normalized = normalizeDocumentText(extracted.text);
    const minimumChars =
      format === 'PDF' ? DOCUMENT_TEXT_PDF_MIN_USABLE_CHARS : 1;

    if (normalized.length < minimumChars) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        APP_ERROR_CODE.DOCUMENT_TEXT_EMPTY,
        'No usable text could be extracted from this document.',
      );
    }

    const limitations = [...extracted.limitations];

    if (normalized.length > DOCUMENT_TEXT_MAX_CHARS) {
      limitations.push(DOCUMENT_TEXT_GLOBAL_TRUNCATION_LIMITATION);

      return {
        format,
        text: normalized.slice(0, DOCUMENT_TEXT_MAX_CHARS),
        limitations,
      };
    }

    return { format, text: normalized, limitations };
  }

  /**
   * Parser failures are logged by the caller only by outcome. The client never
   * sees a parser message, path, stack, or internal cause.
   */
  private async runExtractor(
    format: DocumentTextFormat,
    buffer: Buffer,
  ): Promise<ExtractedDocumentText> {
    try {
      switch (format) {
        case 'PDF':
          return await extractPdfText(buffer);
        case 'DOCX':
          return await extractDocxText(buffer);
        case 'XLSX':
          return extractXlsxText(this.spreadsheetService, buffer);
        case 'PPTX':
          return await extractPptxText(buffer);
      }
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        APP_ERROR_CODE.DOCUMENT_TEXT_EXTRACTION_FAILED,
        'The document text could not be extracted.',
      );
    }
  }
}

/**
 * Normalises whitespace without destroying line structure, then trims.
 * Null bytes and control whitespace from binary formats are removed first.
 */
export function normalizeDocumentText(value: string): string {
  return value
    .replaceAll('\u0000', '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
