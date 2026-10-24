import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskReviewAction } from '../../../generated/prisma/enums.js';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  AI_MAX_ATTEMPTS,
  AI_MIN_RETRY_BUDGET_MS,
} from '../../shared/ai/ai.constant.js';
import { AiService } from '../../shared/ai/ai.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { DocumentTextService } from '../../shared/document-text/document-text.service.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { MAX_FILE_SIZE_BYTES } from '../../shared/file-storage/file-storage.constant.js';
import { FileStorageService } from '../../shared/file-storage/file-storage.service.js';
import {
  readStreamToBufferWithLimit,
  StreamLimitExceededError,
} from '../../shared/file-storage/stream-buffer.helper.js';
import {
  SUBMISSION_AI_ADVISORY_LIMITATION,
  SUBMISSION_AI_ATTACHMENT_CONTEXT_TRUNCATION_LIMITATION,
  SUBMISSION_AI_ATTACHMENT_TEXT_COMBINED_MAX_LENGTH,
  SUBMISSION_AI_ATTACHMENT_TEXT_MAX_LENGTH,
  SUBMISSION_AI_LIMITATIONS_MAX_ITEMS,
  SUBMISSION_AI_MAX_ATTACHMENTS,
  SUBMISSION_AI_MAX_CONTENT_ATTACHMENTS,
  SUBMISSION_AI_MAX_OUTPUT_TOKENS,
  SUBMISSION_AI_REVIEW_JSON_SCHEMA,
  SUBMISSION_AI_SYSTEM_INSTRUCTION,
  SUBMISSION_AI_TEMPERATURE,
} from './submission-ai.constant.js';
import type {
  SubmissionAiAttachmentEvidence,
  SubmissionAiPreviousRevision,
  SubmissionAiReviewResponse,
  SubmissionAiValidationFailureReason,
} from './submission-ai.interface.js';
import { buildSubmissionAiUserPrompt } from './submission-ai.prompt.js';
import { parseSubmissionAiReview } from './submission-ai.validator.js';
import {
  assertReviewAuthority,
  resolveReviewableSubmission,
} from './submission-review.policy.js';
import type { ReviewableSubmission } from './submission-review.policy.js';

interface SubmissionAiAttachmentRead {
  attachments: SubmissionAiAttachmentEvidence[];
  truncated: boolean;
  limitations: string[];
  extractedCount: number;
  unavailableCount: number;
  charactersProvided: number;
}

/**
 * Advisory review of one already-actionable Submission.
 *
 * The real review workflow stays authoritative. This service only reads, asks
 * the provider for structured observations, validates them, and returns them to
 * the client session. It never writes, never transitions a Task or Submission,
 * and never reviews anything the assigned Admin could not review themselves.
 */
@Injectable()
export class SubmissionAiService {
  private readonly logger = new Logger(SubmissionAiService.name);

  private readonly businessTimezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly fileStorage: FileStorageService,
    private readonly documentTextService: DocumentTextService,
    configService: ConfigService<ApplicationConfiguration, true>,
  ) {
    this.businessTimezone =
      configService.get('app.businessTimezone', { infer: true }) ||
      'Asia/Dhaka';
  }

  async analyze(
    viewer: OperixViewer,
    submissionId: string,
  ): Promise<SubmissionAiReviewResponse> {
    assertReviewAuthority(viewer);

    // Resolve first so 404/409 semantics match the real review endpoint even
    // when AI is disabled for the deployment.
    const submission = await resolveReviewableSubmission(
      this.prisma,
      viewer,
      submissionId,
    );

    this.aiService.assertEnabled();

    const today = this.currentBusinessDate(new Date());

    const [attachmentRead, previousRevision] = await Promise.all([
      this.loadAttachmentEvidence(submission.id),
      this.loadPreviousRevision(submission),
    ]);

    const prompt = buildSubmissionAiUserPrompt({
      businessDate: today,
      businessTimezone: this.businessTimezone,
      taskTitle: submission.task.title,
      taskDescription: submission.task.description,
      taskRemarks: submission.task.remarks,
      taskPriority: submission.task.priority,
      taskStatus: submission.task.status,
      taskDueAt: submission.task.dueAt,
      submissionVersion: submission.version,
      submittedAt: submission.submittedAt,
      submissionText: submission.submissionText,
      attachments: attachmentRead.attachments,
      attachmentsTruncated: attachmentRead.truncated,
      previousRevision,
    });

    const [attachmentCoverage, ...attachmentCaveats] =
      attachmentRead.limitations;
    const limitations = this.buildLimitations(
      [
        ...(attachmentCoverage ? [attachmentCoverage] : []),
        ...prompt.limitations,
        ...attachmentCaveats,
      ],
      submission.version,
    );

    const startedAt = Date.now();
    const timeoutMs = this.aiService.getTimeoutMs();
    const deadline = startedAt + timeoutMs;
    const signal = AbortSignal.timeout(timeoutMs);

    let attempts = 0;
    let lastReason: SubmissionAiValidationFailureReason | 'unknown' = 'unknown';

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
        systemInstruction: SUBMISSION_AI_SYSTEM_INSTRUCTION,
        userPrompt: prompt.userPrompt,
        responseJsonSchema: SUBMISSION_AI_REVIEW_JSON_SCHEMA,
        temperature: SUBMISSION_AI_TEMPERATURE,
        maxOutputTokens: SUBMISSION_AI_MAX_OUTPUT_TOKENS,
        signal,
        timeoutMs: remainingMs,
      });

      const parsed = parseSubmissionAiReview(generated.text);

      if (parsed.ok) {
        const latencyMs = Date.now() - startedAt;

        this.logger.log(
          JSON.stringify({
            event: 'submission_ai_review_succeeded',
            feature: 'submission_ai_review',
            provider: this.aiService.getProviderName(),
            model: generated.model,
            actorId: viewer.userId,
            submissionId: submission.publicId,
            version: submission.version,
            attempts,
            latencyMs,
            attachmentCount: attachmentRead.attachments.length,
            attachmentsExtracted: attachmentRead.extractedCount,
            attachmentsUnavailable: attachmentRead.unavailableCount,
            attachmentCharactersProvided: attachmentRead.charactersProvided,
            outcome: 'success',
          }),
        );

        return {
          ...parsed.review,
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
          event: 'submission_ai_review_invalid',
          feature: 'submission_ai_review',
          provider: this.aiService.getProviderName(),
          actorId: viewer.userId,
          submissionId: submission.publicId,
          version: submission.version,
          attempt: attempts,
          reason: parsed.reason,
          remainingMs: deadline - Date.now(),
          outcome: 'invalid_output',
        }),
      );
    }

    this.logger.warn(
      JSON.stringify({
        event: 'submission_ai_review_rejected',
        feature: 'submission_ai_review',
        provider: this.aiService.getProviderName(),
        actorId: viewer.userId,
        submissionId: submission.publicId,
        version: submission.version,
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

  private async loadAttachmentEvidence(
    submissionId: string,
  ): Promise<SubmissionAiAttachmentRead> {
    const rows = await this.prisma.submissionAttachment.findMany({
      where: {
        submissionId,
      },
      select: {
        file: {
          select: {
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            storageKey: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: SUBMISSION_AI_MAX_ATTACHMENTS + 1,
    });

    const selectedRows = rows.slice(0, SUBMISSION_AI_MAX_ATTACHMENTS);
    const attachments: SubmissionAiAttachmentEvidence[] = [];
    const formatLimitations: string[] = [];
    let remainingChars = SUBMISSION_AI_ATTACHMENT_TEXT_COMBINED_MAX_LENGTH;
    let contentCandidates = 0;
    let extractedCount = 0;
    let unsupportedCount = 0;
    let emptyCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let attachmentTextTruncated = false;

    for (const row of selectedRows) {
      const { file } = row;
      const base = {
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      };

      if (!this.documentTextService.isSupported(file.mimeType)) {
        unsupportedCount += 1;
        attachments.push({
          ...base,
          contentStatus: 'UNSUPPORTED',
          extractedText: null,
        });
        continue;
      }

      if (
        contentCandidates >= SUBMISSION_AI_MAX_CONTENT_ATTACHMENTS ||
        remainingChars === 0
      ) {
        skippedCount += 1;
        attachments.push({
          ...base,
          contentStatus: 'SKIPPED_LIMIT',
          extractedText: null,
        });
        continue;
      }

      contentCandidates += 1;

      if (file.sizeBytes > MAX_FILE_SIZE_BYTES) {
        failedCount += 1;
        attachments.push({
          ...base,
          contentStatus: 'FAILED',
          extractedText: null,
        });
        continue;
      }

      try {
        const download = await this.fileStorage.download(file.storageKey);
        const buffer = await readStreamToBufferWithLimit(
          download.stream,
          MAX_FILE_SIZE_BYTES,
        );
        const extraction = await this.documentTextService.extract(
          buffer,
          file.mimeType,
        );
        const allowedChars = Math.min(
          SUBMISSION_AI_ATTACHMENT_TEXT_MAX_LENGTH,
          remainingChars,
        );
        const extractedText = extraction.text.slice(0, allowedChars);

        if (extraction.text.length > allowedChars) {
          attachmentTextTruncated = true;
        }

        remainingChars -= extractedText.length;
        extractedCount += 1;
        formatLimitations.push(...extraction.limitations);
        attachments.push({
          ...base,
          contentStatus: 'EXTRACTED',
          extractedText,
        });
      } catch (error) {
        if (
          this.getAppErrorCode(error) === APP_ERROR_CODE.DOCUMENT_TEXT_EMPTY
        ) {
          emptyCount += 1;
          attachments.push({
            ...base,
            contentStatus: 'EMPTY',
            extractedText: null,
          });
          continue;
        }

        failedCount += 1;
        attachments.push({
          ...base,
          contentStatus: 'FAILED',
          extractedText: null,
        });
      }
    }

    const limitations: string[] = [];

    if (attachments.length > 0) {
      limitations.push(
        `${extractedCount} of ${attachments.length} attachments supplied extractable text for this analysis.`,
      );
    }

    if (attachmentTextTruncated || skippedCount > 0) {
      limitations.push(SUBMISSION_AI_ATTACHMENT_CONTEXT_TRUNCATION_LIMITATION);
    }

    if (unsupportedCount > 0) {
      limitations.push(
        `${unsupportedCount} attachment${unsupportedCount === 1 ? '' : 's'} used an unsupported format and ${unsupportedCount === 1 ? 'was' : 'were'} not text-analyzed.`,
      );
    }

    if (emptyCount > 0) {
      limitations.push(
        `${emptyCount} attachment${emptyCount === 1 ? '' : 's'} contained no extractable text. Scanned or image-only content was not OCR processed.`,
      );
    }

    if (failedCount > 0) {
      limitations.push(
        `${failedCount} attachment${failedCount === 1 ? '' : 's'} could not be converted to readable text.`,
      );
    }

    return {
      attachments,
      truncated: rows.length > SUBMISSION_AI_MAX_ATTACHMENTS,
      limitations: [...limitations, ...formatLimitations],
      extractedCount,
      unavailableCount:
        unsupportedCount + emptyCount + failedCount + skippedCount,
      charactersProvided:
        SUBMISSION_AI_ATTACHMENT_TEXT_COMBINED_MAX_LENGTH - remainingChars,
    };
  }

  private getAppErrorCode(error: unknown): string | null {
    if (!(error instanceof AppException)) {
      return error instanceof StreamLimitExceededError
        ? APP_ERROR_CODE.FILE_TOO_LARGE
        : null;
    }

    const response = error.getResponse();

    if (typeof response !== 'object' || response === null) {
      return null;
    }

    const code = (response as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }

  /**
   * Resolves the actual immediately preceding Submission rather than assuming
   * `version - 1`, and only when its review asked for a revision with feedback.
   */
  private async loadPreviousRevision(
    submission: ReviewableSubmission,
  ): Promise<SubmissionAiPreviousRevision | null> {
    if (submission.version <= 1) {
      return null;
    }

    const previous = await this.prisma.taskSubmission.findFirst({
      where: {
        taskId: submission.taskId,
        version: { lt: submission.version },
      },
      orderBy: {
        version: 'desc',
      },
      select: {
        version: true,
        reviews: {
          select: {
            action: true,
            feedback: true,
          },
          orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });

    if (!previous) {
      return null;
    }

    const review = previous.reviews[0];

    if (review?.action !== TaskReviewAction.REQUEST_REVISION) {
      return null;
    }

    const feedback = review.feedback?.trim() ?? '';

    if (feedback.length === 0) {
      return null;
    }

    return {
      submissionVersion: previous.version,
      feedback,
    };
  }

  private buildLimitations(
    discovered: readonly string[],
    version: number,
  ): string[] {
    return [
      ...new Set([
        SUBMISSION_AI_ADVISORY_LIMITATION,
        `This analysis covers Submission version ${version} only.`,
        ...discovered,
      ]),
    ].slice(0, SUBMISSION_AI_LIMITATIONS_MAX_ITEMS);
  }

  private currentBusinessDate(now: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.businessTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }

  private timedOut(): AppException {
    return new AppException(
      HttpStatus.SERVICE_UNAVAILABLE,
      APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
      'AI request timed out.',
    );
  }
}
