import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import {
  AI_DEFAULT_MAX_OUTPUT_TOKENS,
  AI_DEFAULT_TEMPERATURE,
  GEMINI_PROVIDER_NAME,
} from './ai.constant.js';
import type {
  AiGenerationRequest,
  AiGenerationResult,
  AiProvider,
} from './ai.interface.js';
import {
  AiProviderError,
  type AiProviderErrorClassification,
} from './ai-provider.error.js';

/**
 * Gemini implementation of the provider-neutral AI port.
 *
 * Structured output uses `responseMimeType` + `responseJsonSchema` because
 * that is the surface `models.generateContent` exposes in `@google/genai`
 * 2.30.0 (`responseFormat` lives on the lower-level `GenerationConfig` type
 * and is not accepted here). SDK retries are disabled per request so that the
 * only retry in the system is the semantic retry owned by each feature service.
 */
@Injectable()
export class GeminiAiProvider implements AiProvider {
  readonly name = GEMINI_PROVIDER_NAME;

  private readonly logger = new Logger(GeminiAiProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  private client: GoogleGenAI | null = null;

  constructor(configService: ConfigService<ApplicationConfiguration, true>) {
    const ai = configService.get('ai', { infer: true });
    this.apiKey = ai.apiKey;
    this.model = ai.model;
    this.timeoutMs = ai.timeoutMs;
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    try {
      const client = this.getClient();
      const response = await client.models.generateContent({
        model: this.model,
        contents: request.userPrompt,
        config: {
          systemInstruction: request.systemInstruction,
          responseMimeType: 'application/json',
          responseJsonSchema: request.responseJsonSchema,
          temperature: request.temperature ?? AI_DEFAULT_TEMPERATURE,
          maxOutputTokens:
            request.maxOutputTokens ?? AI_DEFAULT_MAX_OUTPUT_TOKENS,
          abortSignal: request.signal,
          automaticContinuation: false,
          httpOptions: {
            timeout: request.timeoutMs ?? this.timeoutMs,
            retryOptions: { attempts: 1 },
          },
        },
      });

      const text = response.text;

      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new AiProviderError(
          'FAILED',
          'Gemini returned an empty response.',
          null,
          'PROVIDER_EMPTY_RESPONSE',
        );
      }

      return { text, model: this.model };
    } catch (error) {
      const translated = this.translateError(error, request.signal);
      this.logger.warn(
        JSON.stringify({
          event: 'ai_provider_call_failed',
          provider: this.name,
          kind: translated.kind,
          errorClassification: translated.classification,
          providerStatus: translated.providerStatus,
        }),
      );
      throw translated;
    }
  }

  private getClient(): GoogleGenAI {
    if (this.apiKey.length === 0) {
      throw new AiProviderError(
        'UNAVAILABLE',
        'Gemini credentials are not configured.',
        null,
        'PROVIDER_NOT_CONFIGURED',
      );
    }

    this.client ??= new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: {
        timeout: this.timeoutMs,
        retryOptions: { attempts: 1 },
      },
    });

    return this.client;
  }

  /**
   * Translates vendor failures into the neutral classification consumed by
   * `AiService`. The provider message is never forwarded to callers because it
   * can contain request URLs and account identifiers.
   *
   * Client-side 4xx responses are configuration or request defects, not
   * outages. They are classified as `FAILED` so they surface as
   * `AI_GENERATION_FAILED` and are never described as a transient provider
   * outage, and they are never retried by a feature service.
   */
  private translateError(
    error: unknown,
    signal: AbortSignal | undefined,
  ): AiProviderError {
    if (error instanceof AiProviderError) {
      return error;
    }

    if (signal?.aborted === true || isAbortError(error)) {
      return new AiProviderError(
        'TIMEOUT',
        'Gemini request timed out.',
        null,
        'PROVIDER_TIMEOUT',
      );
    }

    const status = resolveHttpStatus(error);

    if (status === 429) {
      return new AiProviderError(
        'RATE_LIMITED',
        'Gemini rate limit reached.',
        status,
        'PROVIDER_RATE_LIMITED',
      );
    }

    const clientFailure = classifyClientFailure(status);

    if (clientFailure !== null) {
      return new AiProviderError(
        'FAILED',
        'Gemini rejected the request.',
        status,
        clientFailure,
      );
    }

    if (status !== null && status >= 500) {
      return new AiProviderError(
        'UNAVAILABLE',
        'Gemini is temporarily unavailable.',
        status,
        'PROVIDER_SERVER_ERROR',
      );
    }

    return new AiProviderError(
      'FAILED',
      'Gemini generation failed.',
      status,
      'PROVIDER_UNKNOWN',
    );
  }
}

function classifyClientFailure(
  status: number | null,
): AiProviderErrorClassification | null {
  if (status === null) return null;

  switch (status) {
    case 401:
      return 'PROVIDER_AUTH_REJECTED';
    case 403:
      return 'PROVIDER_FORBIDDEN';
    case 404:
      return 'PROVIDER_MODEL_NOT_FOUND';
    default:
      return status >= 400 && status < 500 ? 'PROVIDER_BAD_REQUEST' : null;
  }
}

function resolveHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const status = (error as { status?: unknown }).status;

  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const name = (error as { name?: unknown }).name;

  return name === 'AbortError' || name === 'TimeoutError';
}
