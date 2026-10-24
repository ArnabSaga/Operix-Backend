import { validateEnvironment } from '../../../src/config/env.validation';

const validEnvironment = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/operix',
  FRONTEND_URL: 'http://localhost:3001',
  FRONTEND_APP_URL: 'http://localhost:3001',
  SWAGGER_ENABLED: 'false',
  BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
  BETTER_AUTH_URL: 'http://localhost:3000',
  REGISTRATION_RATE_LIMIT_SECRET:
    'registration-rate-limit-secret-at-least-32-characters',
  CRON_SECRET: 'cron-secret-at-least-32-characters-long',
  API_RATE_LIMIT_SECRET: 'api-rate-limit-secret-at-least-32-characters',
  OPERIX_BUSINESS_TIMEZONE: 'Asia/Dhaka',
  SMTP_ENABLED: 'false',
};

describe('validateEnvironment', () => {
  it('validates and normalizes runtime configuration', () => {
    const result = validateEnvironment(validEnvironment);

    expect(result).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3000,
      SWAGGER_ENABLED: false,
      THROTTLE_TTL_MS: 60_000,
      THROTTLE_LIMIT: 100,
    });
  });

  it('does not require TEST_DATABASE_URL at application runtime', () => {
    expect(() => validateEnvironment(validEnvironment)).not.toThrow();
  });

  it('rejects an invalid port', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, PORT: '70000' }),
    ).toThrow('PORT must be an integer between 1 and 65535');
  });

  it('requires valid frontend app URL for email deep links', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, FRONTEND_APP_URL: 'not-url' }),
    ).toThrow('FRONTEND_APP_URL must be a valid URL');
  });

  it('allows SMTP to be disabled without credentials', () => {
    const result = validateEnvironment(validEnvironment);

    expect(result).toMatchObject({
      SMTP_ENABLED: false,
      SMTP_PORT: null,
      SMTP_FROM_NAME: 'Operix',
    });
  });

  it('requires complete SMTP configuration when enabled', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, SMTP_ENABLED: 'true' }),
    ).toThrow('SMTP_PORT is required when SMTP_ENABLED is true');
  });

  it('validates enabled SMTP configuration', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      SMTP_ENABLED: 'true',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'smtp-user',
      SMTP_PASS: 'smtp-pass',
      SMTP_FROM_EMAIL: 'noreply@example.com',
      SMTP_FROM_NAME: 'Operix Mail',
    });

    expect(result).toMatchObject({
      SMTP_ENABLED: true,
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_FROM_EMAIL: 'noreply@example.com',
      SMTP_FROM_NAME: 'Operix Mail',
    });
  });

  it('rejects invalid SMTP values', () => {
    const enabled = {
      ...validEnvironment,
      SMTP_ENABLED: 'true',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'maybe',
      SMTP_USER: 'smtp-user',
      SMTP_PASS: 'smtp-pass',
      SMTP_FROM_EMAIL: 'noreply@example.com',
    };

    expect(() => validateEnvironment(enabled)).toThrow(
      'SMTP_SECURE must be true or false',
    );
    expect(() =>
      validateEnvironment({ ...enabled, SMTP_SECURE: 'false', SMTP_PORT: '0' }),
    ).toThrow('SMTP_PORT must be an integer between 1 and 65535');
    expect(() =>
      validateEnvironment({
        ...enabled,
        SMTP_SECURE: 'false',
        SMTP_FROM_EMAIL: 'bad-email',
      }),
    ).toThrow('SMTP_FROM_EMAIL must be a valid email address');
  });

  it('defaults Swagger off in production when omitted', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      NODE_ENV: 'production',
      SWAGGER_ENABLED: undefined,
    });

    expect(result).toMatchObject({
      SWAGGER_ENABLED: false,
    });
  });

  it('allows explicit Swagger configuration to override the production default', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      NODE_ENV: 'production',
      SWAGGER_ENABLED: 'true',
    });

    expect(result).toMatchObject({
      SWAGGER_ENABLED: true,
    });
  });

  it('validates throttle settings as positive integers in milliseconds', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      THROTTLE_TTL_MS: '120000',
      THROTTLE_LIMIT: '250',
    });

    expect(result).toMatchObject({
      THROTTLE_TTL_MS: 120_000,
      THROTTLE_LIMIT: 250,
    });
  });

  it('rejects invalid throttle settings', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, THROTTLE_TTL_MS: '0' }),
    ).toThrow('THROTTLE_TTL_MS must be a positive integer');

    expect(() =>
      validateEnvironment({ ...validEnvironment, THROTTLE_LIMIT: 'nope' }),
    ).toThrow('THROTTLE_LIMIT must be a positive integer');
  });

  it('leaves AI disabled by default without requiring a provider key', () => {
    const result = validateEnvironment(validEnvironment);

    expect(result).toMatchObject({
      AI_ENABLED: false,
      AI_PROVIDER: '',
      GEMINI_API_KEY: '',
      GEMINI_MODEL: '',
      AI_TIMEOUT_MS: 30_000,
    });
  });

  it('accepts Gemini as the only enabled provider', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      AI_ENABLED: 'true',
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'gemini-test-key',
      GEMINI_MODEL: 'gemini-3.1-flash-lite',
    });

    expect(result).toMatchObject({
      AI_ENABLED: true,
      AI_PROVIDER: 'gemini',
      GEMINI_MODEL: 'gemini-3.1-flash-lite',
      AI_TIMEOUT_MS: 30_000,
    });
  });

  it('rejects an enabled AI configuration without a provider or key', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AI_ENABLED: 'true',
        GEMINI_API_KEY: 'gemini-test-key',
        GEMINI_MODEL: 'gemini-3.1-flash-lite',
      }),
    ).toThrow('AI_PROVIDER is required');

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AI_ENABLED: 'true',
        AI_PROVIDER: 'gemini',
        GEMINI_MODEL: 'gemini-3.1-flash-lite',
      }),
    ).toThrow('GEMINI_API_KEY is required');

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AI_ENABLED: 'true',
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-test-key',
      }),
    ).toThrow('GEMINI_MODEL is required');
  });

  it('rejects any AI provider other than Gemini', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AI_ENABLED: 'true',
        AI_PROVIDER: 'openai',
        GEMINI_API_KEY: 'gemini-test-key',
        GEMINI_MODEL: 'gemini-3.1-flash-lite',
      }),
    ).toThrow('AI_PROVIDER must be "gemini" when AI_ENABLED is true');
  });

  it('validates the AI timeout as a positive integer in milliseconds', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      AI_TIMEOUT_MS: '45000',
    });

    expect(result).toMatchObject({ AI_TIMEOUT_MS: 45_000 });

    expect(() =>
      validateEnvironment({ ...validEnvironment, AI_TIMEOUT_MS: '0' }),
    ).toThrow('AI_TIMEOUT_MS must be a positive integer');
  });

  it('requires a separate API rate limit secret with sufficient entropy', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, API_RATE_LIMIT_SECRET: '' }),
    ).toThrow('API_RATE_LIMIT_SECRET is required');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        API_RATE_LIMIT_SECRET: 'short',
      }),
    ).toThrow('API_RATE_LIMIT_SECRET must be at least 32 characters long');
  });
});
