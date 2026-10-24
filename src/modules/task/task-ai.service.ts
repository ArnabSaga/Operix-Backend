import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../../generated/prisma/enums.js';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import { AiService } from '../../shared/ai/ai.service.js';
import {
  AI_MAX_ATTEMPTS,
  AI_MIN_RETRY_BUDGET_MS,
} from '../../shared/ai/ai.constant.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import type { GenerateTaskAiDraftDto } from './dto/generate-task-ai-draft.dto.js';
import {
  TASK_AI_DRAFT_JSON_SCHEMA,
  TASK_AI_SYSTEM_INSTRUCTION,
} from './task-ai.constant.js';
import type {
  TaskAiDraftResponse,
  TaskAiValidationFailureReason,
} from './task-ai.interface.js';
import { parseTaskAiDraft } from './task-ai.validator.js';

/**
 * Operix Task draft semantics on top of the provider-neutral AI boundary.
 *
 * Ownership of the shared deadline and of the single semantic retry lives
 * here, not in the provider, so the retry policy stays independent of which
 * provider is configured.
 */
@Injectable()
export class TaskAiService {
  private readonly logger = new Logger(TaskAiService.name);
  private readonly businessTimezone: string;

  constructor(
    private readonly aiService: AiService,
    configService: ConfigService<ApplicationConfiguration, true>,
  ) {
    this.businessTimezone =
      configService.get('app.businessTimezone', { infer: true }) ||
      'Asia/Dhaka';
  }

  async draft(
    viewer: OperixViewer,
    dto: GenerateTaskAiDraftDto,
  ): Promise<TaskAiDraftResponse> {
    this.assertDraftRole(viewer);
    this.aiService.assertEnabled();

    const startedAt = Date.now();
    const timeoutMs = this.aiService.getTimeoutMs();
    const deadline = startedAt + timeoutMs;
    const signal = AbortSignal.timeout(timeoutMs);
    const today = this.currentBusinessDate(new Date(startedAt));

    let attempts = 0;
    let lastReason: TaskAiValidationFailureReason | 'unknown' = 'unknown';

    while (attempts < AI_MAX_ATTEMPTS) {
      if (signal.aborted) {
        throw this.timedOut();
      }

      const remainingMs = deadline - Date.now();

      if (remainingMs <= 0) {
        throw this.timedOut();
      }

      // A second call is only worth starting when enough budget remains to
      // finish it; otherwise the retry would just consume the deadline.
      if (attempts > 0 && remainingMs < AI_MIN_RETRY_BUDGET_MS) {
        break;
      }

      attempts += 1;

      const generated = await this.aiService.generate({
        systemInstruction: TASK_AI_SYSTEM_INSTRUCTION,
        userPrompt: this.buildUserPrompt(dto.prompt, today),
        responseJsonSchema: TASK_AI_DRAFT_JSON_SCHEMA,
        signal,
        timeoutMs: remainingMs,
      });

      const parsed = parseTaskAiDraft(generated.text);

      if (parsed.ok) {
        return {
          ...parsed.draft,
          meta: {
            model: generated.model,
            attempts,
            latencyMs: Date.now() - startedAt,
          },
        };
      }

      lastReason = parsed.reason;

      this.logger.warn(
        JSON.stringify({
          event: 'task_ai_draft_invalid',
          attempt: attempts,
          reason: parsed.reason,
          remainingMs: deadline - Date.now(),
        }),
      );
    }

    this.logger.warn(
      JSON.stringify({
        event: 'task_ai_draft_rejected',
        attempts,
        reason: lastReason,
      }),
    );

    throw new AppException(
      HttpStatus.BAD_GATEWAY,
      APP_ERROR_CODE.AI_RESPONSE_INVALID,
      'The AI response could not be used. Please try again.',
    );
  }

  private assertDraftRole(viewer: OperixViewer): void {
    if (
      viewer.role !== UserRole.SUPER_ADMIN &&
      viewer.role !== UserRole.ADMIN
    ) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to this resource.',
      );
    }
  }

  private buildUserPrompt(prompt: string, today: string): string {
    return [
      `Current business date (${this.businessTimezone}): ${today}`,
      '',
      'Administrator request:',
      '"""',
      // Prevents a trivial fence break; the system instruction already frames
      // this block as data rather than instructions.
      prompt.replace(/"{3,}/g, "'''"),
      '"""',
    ].join('\n');
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
