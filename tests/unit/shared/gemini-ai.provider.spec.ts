import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ApplicationConfiguration } from '../../../src/config/configuration';
import type { AiGenerationRequest } from '../../../src/shared/ai/ai.interface';
import { AiProviderError } from '../../../src/shared/ai/ai-provider.error';
import {
  AI_DEFAULT_MAX_OUTPUT_TOKENS,
  AI_DEFAULT_TEMPERATURE,
} from '../../../src/shared/ai/ai.constant';

const jestApi = import.meta.jest;

const generateContent = jestApi.fn();
const clientConstructor = jestApi.fn();

class FakeGoogleGenAI {
  readonly models = { generateContent };

  constructor(options: unknown) {
    clientConstructor(options);
  }
}

jestApi.unstable_mockModule('@google/genai', () => ({
  GoogleGenAI: FakeGoogleGenAI,
}));

const { GeminiAiProvider } =
  await import('../../../src/shared/ai/gemini-ai.provider');

const originalWarn = Logger.prototype.warn.bind(Logger.prototype);
let warnPayloads: string[] = [];

beforeEach(() => {
  generateContent.mockReset();
  clientConstructor.mockReset();
  warnPayloads = [];
  Logger.prototype.warn = ((message: unknown) => {
    warnPayloads.push(String(message));
  }) as typeof Logger.prototype.warn;
});

afterEach(() => {
  Logger.prototype.warn = originalWarn;
});

function createConfigService(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
  }> = {},
): ConfigService<ApplicationConfiguration, true> {
  return {
    get: jestApi.fn().mockReturnValue({
      enabled: true,
      provider: 'gemini',
      apiKey: 'test-api-key',
      model: 'gemini-test-model',
      timeoutMs: 30_000,
      ...overrides,
    }),
  } as unknown as ConfigService<ApplicationConfiguration, true>;
}

function createRequest(
  overrides: Partial<AiGenerationRequest> = {},
): AiGenerationRequest {
  return {
    systemInstruction: 'system instruction',
    userPrompt: 'user prompt',
    responseJsonSchema: { type: 'object' },
    ...overrides,
  };
}

function providerErrorFrom(error: unknown): AiProviderError {
  expect(error).toBeInstanceOf(AiProviderError);
  return error as AiProviderError;
}

describe('GeminiAiProvider request mapping', () => {
  it('sends the neutral request through structured JSON generation', async () => {
    generateContent.mockResolvedValue({ text: '{"status":"OK"}' });
    const provider = new GeminiAiProvider(createConfigService());

    await expect(
      provider.generate(
        createRequest({
          temperature: 0.3,
          maxOutputTokens: 42,
          timeoutMs: 5_000,
        }),
      ),
    ).resolves.toEqual({
      text: '{"status":"OK"}',
      model: 'gemini-test-model',
    });

    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-test-model',
      contents: 'user prompt',
      config: {
        systemInstruction: 'system instruction',
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
        temperature: 0.3,
        maxOutputTokens: 42,
        abortSignal: undefined,
        automaticContinuation: false,
        httpOptions: {
          timeout: 5_000,
          retryOptions: { attempts: 1 },
        },
      },
    });
  });

  it('applies the shared defaults when the caller omits generation options', async () => {
    generateContent.mockResolvedValue({ text: '{}' });
    const provider = new GeminiAiProvider(createConfigService());

    await provider.generate(createRequest());

    const expectedConfig = expect.objectContaining({
      temperature: AI_DEFAULT_TEMPERATURE,
      maxOutputTokens: AI_DEFAULT_MAX_OUTPUT_TOKENS,
      httpOptions: {
        timeout: 30_000,
        retryOptions: { attempts: 1 },
      },
    }) as unknown as Record<string, unknown>;

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ config: expectedConfig }),
    );
  });

  it('constructs one client lazily and disables SDK retries', async () => {
    generateContent.mockResolvedValue({ text: '{}' });
    const provider = new GeminiAiProvider(createConfigService());

    expect(clientConstructor).not.toHaveBeenCalled();

    await provider.generate(createRequest());
    await provider.generate(createRequest());

    expect(clientConstructor).toHaveBeenCalledTimes(1);
    expect(clientConstructor).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      httpOptions: {
        timeout: 30_000,
        retryOptions: { attempts: 1 },
      },
    });
  });
});

describe('GeminiAiProvider failure classification', () => {
  it('reports missing credentials without constructing a client', async () => {
    const provider = new GeminiAiProvider(createConfigService({ apiKey: '' }));

    const error = await provider
      .generate(createRequest())
      .catch((caught: unknown) => caught);

    expect(providerErrorFrom(error)).toMatchObject({
      kind: 'UNAVAILABLE',
      classification: 'PROVIDER_NOT_CONFIGURED',
      providerStatus: null,
    });
    expect(generateContent).not.toHaveBeenCalled();
    expect(clientConstructor).not.toHaveBeenCalled();
  });

  it('treats an empty model response as a failed generation', async () => {
    generateContent.mockResolvedValue({ text: '   ' });
    const provider = new GeminiAiProvider(createConfigService());

    const error = await provider
      .generate(createRequest())
      .catch((caught: unknown) => caught);

    expect(providerErrorFrom(error)).toMatchObject({
      kind: 'FAILED',
      classification: 'PROVIDER_EMPTY_RESPONSE',
      providerStatus: null,
    });
  });

  it.each([
    [400, 'FAILED', 'PROVIDER_BAD_REQUEST'],
    [401, 'FAILED', 'PROVIDER_AUTH_REJECTED'],
    [403, 'FAILED', 'PROVIDER_FORBIDDEN'],
    [404, 'FAILED', 'PROVIDER_MODEL_NOT_FOUND'],
    [422, 'FAILED', 'PROVIDER_BAD_REQUEST'],
    [429, 'RATE_LIMITED', 'PROVIDER_RATE_LIMITED'],
    [500, 'UNAVAILABLE', 'PROVIDER_SERVER_ERROR'],
    [503, 'UNAVAILABLE', 'PROVIDER_SERVER_ERROR'],
  ] as const)(
    'classifies HTTP %s as %s',
    async (status, kind, classification) => {
      generateContent.mockRejectedValue(
        Object.assign(new Error('provider detail'), { status }),
      );
      const provider = new GeminiAiProvider(createConfigService());

      const error = await provider
        .generate(createRequest())
        .catch((caught: unknown) => caught);

      expect(providerErrorFrom(error)).toMatchObject({
        kind,
        classification,
        providerStatus: status,
      });
    },
  );

  it('never reports a client-side 4xx as a provider outage', async () => {
    generateContent.mockRejectedValue(
      Object.assign(new Error('bad request'), { status: 400 }),
    );
    const provider = new GeminiAiProvider(createConfigService());

    const error = await provider
      .generate(createRequest())
      .catch((caught: unknown) => caught);

    expect(providerErrorFrom(error).kind).not.toBe('UNAVAILABLE');
  });

  it('classifies an abort error as a timeout', async () => {
    generateContent.mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
    );
    const provider = new GeminiAiProvider(createConfigService());

    const error = await provider
      .generate(createRequest())
      .catch((caught: unknown) => caught);

    expect(providerErrorFrom(error)).toMatchObject({
      kind: 'TIMEOUT',
      classification: 'PROVIDER_TIMEOUT',
      providerStatus: null,
    });
  });

  it('classifies an aborted shared deadline as a timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    generateContent.mockRejectedValue(new Error('socket hang up'));
    const provider = new GeminiAiProvider(createConfigService());

    const error = await provider
      .generate(createRequest({ signal: controller.signal }))
      .catch((caught: unknown) => caught);

    expect(providerErrorFrom(error)).toMatchObject({
      kind: 'TIMEOUT',
      classification: 'PROVIDER_TIMEOUT',
    });
  });

  it('classifies an unclassified failure without leaking the vendor message', async () => {
    generateContent.mockRejectedValue(
      new Error('VENDOR URL https://example.invalid/account'),
    );
    const provider = new GeminiAiProvider(createConfigService());

    const error = await provider
      .generate(createRequest())
      .catch((caught: unknown) => caught);

    expect(providerErrorFrom(error)).toMatchObject({
      kind: 'FAILED',
      classification: 'PROVIDER_UNKNOWN',
      providerStatus: null,
    });
    expect((error as Error).message).not.toContain('example.invalid');
    expect(warnPayloads.join('\n')).not.toContain('example.invalid');
  });
});
