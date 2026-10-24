import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  AI_MAX_ATTEMPTS,
  AI_MIN_RETRY_BUDGET_MS,
} from '../../shared/ai/ai.constant.js';
import { AiService } from '../../shared/ai/ai.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { DocumentTextService } from '../../shared/document-text/document-text.service.js';
import type { DocumentTextExtraction } from '../../shared/document-text/document-text.interface.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { MAX_FILE_SIZE_BYTES } from '../../shared/file-storage/file-storage.constant.js';
import { FileStorageService } from '../../shared/file-storage/file-storage.service.js';
import {
  readStreamToBufferWithLimit,
  StreamLimitExceededError,
} from '../../shared/file-storage/stream-buffer.helper.js';
import {
  DOCUMENT_AI_ADVISORY_LIMITATION,
  DOCUMENT_AI_ANALYSIS_JSON_SCHEMA,
  DOCUMENT_AI_LIMITATIONS_MAX_ITEMS,
  DOCUMENT_AI_MAX_OUTPUT_TOKENS,
  DOCUMENT_AI_SYSTEM_INSTRUCTION,
  DOCUMENT_AI_TEMPERATURE,
} from './document-ai.constant.js';
import type {
  DocumentAiResponse,
  DocumentAiValidationFailureReason,
} from './document-ai.interface.js';
import { buildDocumentAiUserPrompt } from './document-ai.prompt.js';
import { parseDocumentAiAnalysis } from './document-ai.validator.js';
import { buildDocumentScopeWhere } from './policies/document-scope.policy.js';

/**
 * Advisory document analysis.
 *
 * Authorisation runs through the Documents scope predicate — the same one that
 * governs the library list — never through broader parent-scope download
 * semantics. Format and size gates run after authorisation so an unauthorised
 * caller learns nothing about a file's type or existence.
 *
 * This service performs no mutations and opens no transaction. Storage read,
 * text extraction, and provider generation are independent steps; a Document
 * deleted mid-request simply yields a safe failure.
 */
@Injectable()
export class DocumentAiService {
  private readonly logger = new Logger(DocumentAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly fileStorage: FileStorageService,
    private readonly documentTextService: DocumentTextService,
  ) {}

  async analyzeDocument(
    viewer: OperixViewer,
    documentPublicId: string,
  ): Promise<DocumentAiResponse> {
    const document = await this.prisma.fileAsset.findFirst({
      where: {
        AND: [buildDocumentScopeWhere(viewer), { publicId: documentPublicId }],
      },
      select: {
        publicId: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        storageKey: true,
      },
    });

    if (!document) {
      throw this.fileNotFound();
    }

    this.aiService.assertEnabled();

    if (!this.documentTextService.isSupported(document.mimeType)) {
      throw new AppException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        APP_ERROR_CODE.DOCUMENT_AI_UNSUPPORTED_FORMAT,
        'This document format is not supported for AI analysis.',
      );
    }

    // Cheap rejection from stored metadata. The bytes-read helper below is the
    // authoritative cap, because metadata is never trusted as the real size.
    if (document.sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw this.fileTooLarge();
    }

    const buffer = await this.readStorageObject(document.storageKey);
    const extraction = await this.extractDocumentText(
      viewer,
      document.publicId,
      document.mimeType,
      buffer,
    );

    const limitations = this.buildLimitations(extraction.limitations);
    const userPrompt = buildDocumentAiUserPrompt({
      documentName: document.originalName,
      format: extraction.format,
      text: extraction.text,
    });

    const startedAt = Date.now();
    const timeoutMs = this.aiService.getTimeoutMs();
    const deadline = startedAt + timeoutMs;
    const signal = AbortSignal.timeout(timeoutMs);

    let attempts = 0;
    let lastReason: DocumentAiValidationFailureReason | 'unknown' = 'unknown';

    while (attempts < AI_MAX_ATTEMPTS) {
      if (signal.aborted) {
        throw this.timedOut();
      }

      const remainingMs = deadline - Date.now();

      if (remainingMs <= 0) {
        throw this.timedOut();
      }

      // A retry is only worth starting when enough budget remains to finish it.
      if (attempts > 0 && remainingMs < AI_MIN_RETRY_BUDGET_MS) {
        break;
      }

      attempts += 1;

      // Provider failures surface as AppException and are never retried here.
      const generated = await this.aiService.generate({
        systemInstruction: DOCUMENT_AI_SYSTEM_INSTRUCTION,
        userPrompt,
        responseJsonSchema: DOCUMENT_AI_ANALYSIS_JSON_SCHEMA,
        temperature: DOCUMENT_AI_TEMPERATURE,
        maxOutputTokens: DOCUMENT_AI_MAX_OUTPUT_TOKENS,
        signal,
        timeoutMs: remainingMs,
      });

      const parsed = parseDocumentAiAnalysis(generated.text);

      if (parsed.ok) {
        const latencyMs = Date.now() - startedAt;

        this.logger.log(
          JSON.stringify({
            event: 'document_ai_analysis_succeeded',
            feature: 'document_ai',
            provider: this.aiService.getProviderName(),
            model: generated.model,
            actorId: viewer.userId,
            documentId: document.publicId,
            format: extraction.format,
            textLength: extraction.text.length,
            attempts,
            latencyMs,
            outcome: 'success',
          }),
        );

        return {
          documentId: document.publicId,
          ...parsed.analysis,
          limitations,
          meta: {
            provider: this.aiService.getProviderName(),
            model: generated.model,
            attempts,
            latencyMs,
          },
        };
      }

      lastReason = parsed.reason;

      this.logger.warn(
        JSON.stringify({
          event: 'document_ai_analysis_invalid',
          feature: 'document_ai',
          provider: this.aiService.getProviderName(),
          actorId: viewer.userId,
          documentId: document.publicId,
          attempt: attempts,
          reason: parsed.reason,
          remainingMs: deadline - Date.now(),
          outcome: 'invalid_output',
        }),
      );
    }

    this.logger.warn(
      JSON.stringify({
        event: 'document_ai_analysis_rejected',
        feature: 'document_ai',
        provider: this.aiService.getProviderName(),
        actorId: viewer.userId,
        documentId: document.publicId,
        attempts,
        reason: lastReason,
        outcome: 'rejected',
      }),
    );

    throw new AppException(
      HttpStatus.BAD_GATEWAY,
      APP_ERROR_CODE.AI_RESPONSE_INVALID,
      'The AI response could not be used. Please try again.',
    );
  }

  /**
   * Extraction failures are logged by outcome only. No parser message, path,
   * or stack ever reaches the client or the log payload.
   */
  private async extractDocumentText(
    viewer: OperixViewer,
    documentPublicId: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<DocumentTextExtraction> {
    try {
      return await this.documentTextService.extract(buffer, mimeType);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'document_ai_extraction_failed',
          feature: 'document_ai',
          actorId: viewer.userId,
          documentId: documentPublicId,
          mimeType,
          status: error instanceof AppException ? error.getStatus() : 'unknown',
          outcome: 'extraction_failed',
        }),
      );

      throw error;
    }
  }

  /**
   * Buffers the stored object while counting actual bytes. A record whose
   * `sizeBytes` understates the object is still stopped at the same ceiling.
   */
  private async readStorageObject(storageKey: string): Promise<Buffer> {
    const download = await this.fileStorage.download(storageKey);

    try {
      return await readStreamToBufferWithLimit(
        download.stream,
        MAX_FILE_SIZE_BYTES,
      );
    } catch (error) {
      if (error instanceof StreamLimitExceededError) {
        throw this.fileTooLarge();
      }

      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        APP_ERROR_CODE.FILE_STORAGE_UNAVAILABLE,
        'File storage is unavailable.',
      );
    }
  }

  /**
   * Server-owned limitations are appended deterministically: advisory first,
   * then format-specific caveats, then truncation notes. Duplicates are
   * removed and the list is bounded.
   */
  private buildLimitations(discovered: readonly string[]): string[] {
    return [...new Set([DOCUMENT_AI_ADVISORY_LIMITATION, ...discovered])].slice(
      0,
      DOCUMENT_AI_LIMITATIONS_MAX_ITEMS,
    );
  }

  private fileNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      APP_ERROR_CODE.FILE_NOT_FOUND,
      'File not found.',
    );
  }

  private fileTooLarge(): AppException {
    return new AppException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      APP_ERROR_CODE.FILE_TOO_LARGE,
      'This file exceeds the maximum size allowed for AI analysis.',
    );
  }

  private timedOut(): AppException {
    return new AppException(
      HttpStatus.SERVICE_UNAVAILABLE,
      APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
      'AI request timed out.',
    );
  }
}
