import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import { AI_PROVIDER } from './ai.constant.js';
import type {
  AiGenerationRequest,
  AiGenerationResult,
  AiProvider,
} from './ai.interface.js';
import { AiProviderError } from './ai-provider.error.js';

interface MappedAiFailure {
  exception: AppException;
  code: string;
  providerStatus: number | null;
}

/**
 * Boundary between Operix and any AI provider.
 *
 * Responsibilities kept here on purpose:
 * - enabled/provider configuration;
 * - translation of provider failures into stable Operix error codes;
 * - structured operational logging without prompts or responses.
 *
 * It deliberately knows nothing about tasks, drafts, or business validation.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly enabled: boolean;
  private readonly providerName: string;
  private readonly timeoutMs: number;

  constructor(
    configService: ConfigService<ApplicationConfiguration, true>,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {
    const ai = configService.get('ai', { infer: true });
    this.enabled = ai.enabled;
    this.providerName = ai.provider;
    this.timeoutMs = ai.timeoutMs;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Total generation budget for one logical AI request, in milliseconds. */
  getTimeoutMs(): number {
    return this.timeoutMs;
  }

  /** Configured provider name, safe to expose in operational metadata. */
  getProviderName(): string {
    return this.providerName;
  }

  assertEnabled(): void {
    if (!this.enabled) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        APP_ERROR_CODE.AI_DISABLED,
        'AI features are disabled.',
      );
    }
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    this.assertEnabled();
    const startedAt = Date.now();

    try {
      const result = await this.provider.generate(request);
      this.logger.log(
        JSON.stringify({
          event: 'ai_generation_succeeded',
          provider: this.providerName,
          latencyMs: Date.now() - startedAt,
        }),
      );
      return result;
    } catch (error) {
      const failure = this.mapError(error, request.signal);
      this.logger.warn(
        JSON.stringify({
          event: 'ai_generation_failed',
          provider: this.providerName,
          code: failure.code,
          providerStatus: failure.providerStatus,
          deadlineExceeded: request.signal?.aborted === true,
          latencyMs: Date.now() - startedAt,
        }),
      );
      throw failure.exception;
    }
  }

  private mapError(
    error: unknown,
    signal: AbortSignal | undefined,
  ): MappedAiFailure {
    if (signal?.aborted === true) {
      return {
        exception: new AppException(
          HttpStatus.SERVICE_UNAVAILABLE,
          APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
          'AI request timed out.',
        ),
        code: APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
        providerStatus: null,
      };
    }

    if (error instanceof AiProviderError) {
      if (error.kind === 'RATE_LIMITED') {
        return {
          exception: new AppException(
            HttpStatus.TOO_MANY_REQUESTS,
            APP_ERROR_CODE.AI_RATE_LIMITED,
            'The AI provider is rate limited. Try again shortly.',
          ),
          code: APP_ERROR_CODE.AI_RATE_LIMITED,
          providerStatus: error.providerStatus,
        };
      }

      if (error.kind === 'UNAVAILABLE') {
        return {
          exception: new AppException(
            HttpStatus.SERVICE_UNAVAILABLE,
            APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
            'The AI provider is unavailable.',
          ),
          code: APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
          providerStatus: error.providerStatus,
        };
      }

      return {
        exception: new AppException(
          HttpStatus.BAD_GATEWAY,
          APP_ERROR_CODE.AI_GENERATION_FAILED,
          'AI generation failed.',
        ),
        code: APP_ERROR_CODE.AI_GENERATION_FAILED,
        providerStatus: error.providerStatus,
      };
    }

    return {
      exception: new AppException(
        HttpStatus.BAD_GATEWAY,
        APP_ERROR_CODE.AI_GENERATION_FAILED,
        'AI generation failed.',
      ),
      code: APP_ERROR_CODE.AI_GENERATION_FAILED,
      providerStatus: null,
    };
  }
}
