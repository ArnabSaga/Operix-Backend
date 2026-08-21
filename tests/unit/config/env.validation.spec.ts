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
  SMTP_ENABLED: 'false',
};

describe('validateEnvironment', () => {
  it('validates and normalizes runtime configuration', () => {
    const result = validateEnvironment(validEnvironment);

    expect(result).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3000,
      SWAGGER_ENABLED: false,
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
});
