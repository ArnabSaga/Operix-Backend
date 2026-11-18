import { HttpStatus, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ApplicationConfiguration } from '../../../src/config/configuration';
import type {
  AiGenerationRequest,
  AiGenerationResult,
  AiProvider,
} from '../../../src/shared/ai/ai.interface';
import { AiProviderError } from '../../../src/shared/ai/ai-provider.error';
import { AiService } from '../../../src/shared/ai/ai.service';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import { AppException } from '../../../src/shared/errors/app.exception';

const jestApi: typeof jest = import.meta.jest as unknown as typeof jest;

const request: AiGenerationRequest = {
  systemInstruction: 'SECRET SYSTEM INSTRUCTION',
  userPrompt: 'SECRET BUSINESS PROMPT',
  responseJsonSchema: { type: 'object' },
  signal: undefined,
};

function createConfigService(
  overrides: { enabled?: boolean; timeoutMs?: number } = {},
): ConfigService<ApplicationConfiguration, true> {
  return {
    get: jestApi.fn().mockReturnValue({
      enabled: true,
      provider: 'gemini',
      apiKey: 'test-key',
      model: 'gemini-test',
      timeoutMs: 30_000,
      ...overrides,
    }),
  } as unknown as ConfigService<ApplicationConfiguration, true>;
}

interface Harness {
  service: AiService;
  generate: jest.Mock<Promise<AiGenerationResult>, [AiGenerationRequest]>;
}

function createHarness(overrides?: {
  enabled?: boolean;
  timeoutMs?: number;
}): Harness {
  const generate = jestApi.fn<
    Promise<AiGenerationResult>,
    [AiGenerationRequest]
  >();
  const provider: AiProvider = { name: 'gemini', generate };

  return {
    service: new AiService(createConfigService(overrides), provider),
    generate,
  };
}

function lastLog(spy: jest.SpyInstance): Record<string, unknown> {
  const calls = spy.mock.calls as unknown[][];
  const payload = calls.at(-1)?.[0];

  expect(typeof payload).toBe('string');

  return JSON.parse(payload as string) as Record<string, unknown>;
}

describe('AiService configuration surface', () => {
  afterEach(() => jestApi.restoreAllMocks());

  it('exposes enabled state, provider name and the total generation budget', () => {
    const test = createHarness({ timeoutMs: 12_345 });

    expect(test.service.isEnabled()).toBe(true);
    expect(test.service.getProviderName()).toBe('gemini');
    expect(test.service.getTimeoutMs()).toBe(12_345);
  });

  it('rejects generation with AI_DISABLED and never calls the provider', async () => {
    const test = createHarness({ enabled: false });

    let thrown: unknown;
    try {
      test.service.assertEnabled();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppException);
    expect((thrown as AppException).getResponse()).toMatchObject({
      code: APP_ERROR_CODE.AI_DISABLED,
    });
    await expect(test.service.generate(request)).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: APP_ERROR_CODE.AI_DISABLED },
    });
    expect(test.generate).not.toHaveBeenCalled();
  });
});

describe('AiService failure translation', () => {
  afterEach(() => jestApi.restoreAllMocks());

  it('returns the provider result and logs metadata only', async () => {
    const logSpy = jestApi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const test = createHarness();
    test.generate.mockResolvedValue({ text: '{}', model: 'gemini-test' });

    await expect(test.service.generate(request)).resolves.toEqual({
      text: '{}',
      model: 'gemini-test',
    });

    const payload = lastLog(logSpy);
    expect(payload).toMatchObject({
      event: 'ai_generation_succeeded',
      provider: 'gemini',
      outcome: 'success',
    });
    expect(JSON.stringify(payload)).not.toContain(request.userPrompt);
    expect(JSON.stringify(payload)).not.toContain(request.systemInstruction);
  });

  it('maps a provider timeout to AI_TIMEOUT, not to an outage', async () => {
    const warnSpy = jestApi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const test = createHarness();
    test.generate.mockRejectedValue(
      new AiProviderError(
        'TIMEOUT',
        'Gemini request timed out.',
        null,
        'PROVIDER_TIMEOUT',
      ),
    );

    await expect(test.service.generate(request)).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: APP_ERROR_CODE.AI_TIMEOUT },
    });

    expect(lastLog(warnSpy)).toMatchObject({
      event: 'ai_generation_failed',
      code: APP_ERROR_CODE.AI_TIMEOUT,
      errorClassification: 'PROVIDER_TIMEOUT',
      outcome: 'failed',
    });
  });

  it('maps an aborted shared deadline to AI_TIMEOUT even for a raw error', async () => {
    jestApi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const test = createHarness();
    const controller = new AbortController();
    controller.abort();
    test.generate.mockRejectedValue(new Error('socket hang up'));

    await expect(
      test.service.generate({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: APP_ERROR_CODE.AI_TIMEOUT },
    });
  });

  it('maps rate limiting to AI_RATE_LIMITED', async () => {
    jestApi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const test = createHarness();
    test.generate.mockRejectedValue(
      new AiProviderError(
        'RATE_LIMITED',
        'Gemini rate limit reached.',
        429,
        'PROVIDER_RATE_LIMITED',
      ),
    );

    await expect(test.service.generate(request)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: APP_ERROR_CODE.AI_RATE_LIMITED },
    });
  });

  it('maps an unavailable provider to AI_PROVIDER_UNAVAILABLE', async () => {
    jestApi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const test = createHarness();
    test.generate.mockRejectedValue(
      new AiProviderError(
        'UNAVAILABLE',
        'Gemini is temporarily unavailable.',
        503,
        'PROVIDER_SERVER_ERROR',
      ),
    );

    await expect(test.service.generate(request)).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE },
    });
  });

  it.each([
    ['PROVIDER_BAD_REQUEST', 400],
    ['PROVIDER_AUTH_REJECTED', 401],
    ['PROVIDER_FORBIDDEN', 403],
    ['PROVIDER_MODEL_NOT_FOUND', 404],
  ] as const)(
    'maps a %s provider rejection to AI_GENERATION_FAILED',
    async (classification, providerStatus) => {
      const warnSpy = jestApi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const test = createHarness();
      test.generate.mockRejectedValue(
        new AiProviderError(
          'FAILED',
          'Gemini rejected the request.',
          providerStatus,
          classification,
        ),
      );

      await expect(test.service.generate(request)).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        response: { code: APP_ERROR_CODE.AI_GENERATION_FAILED },
      });

      expect(lastLog(warnSpy)).toMatchObject({
        code: APP_ERROR_CODE.AI_GENERATION_FAILED,
        errorClassification: classification,
        providerStatus,
      });
    },
  );

  it('maps an unrecognised thrown value to AI_GENERATION_FAILED', async () => {
    jestApi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const test = createHarness();
    test.generate.mockRejectedValue('not an error');

    await expect(test.service.generate(request)).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
      response: { code: APP_ERROR_CODE.AI_GENERATION_FAILED },
    });
  });

  it('never logs the prompt, the system instruction, or the raw provider message', async () => {
    const warnSpy = jestApi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const test = createHarness();
    test.generate.mockRejectedValue(
      new AiProviderError(
        'FAILED',
        'RAW PROVIDER MESSAGE WITH ACCOUNT URL',
        404,
        'PROVIDER_MODEL_NOT_FOUND',
      ),
    );

    await expect(test.service.generate(request)).rejects.toBeInstanceOf(Error);

    const serialized = warnSpy.mock.calls
      .map((call) => String(call[0]))
      .join('\n');

    expect(serialized).not.toContain('RAW PROVIDER MESSAGE');
    expect(serialized).not.toContain(request.userPrompt);
    expect(serialized).not.toContain(request.systemInstruction);
    expect(serialized).not.toContain('test-key');
  });
});
