import { validateEnvironment } from '../../../src/config/env.validation';

const validEnvironment = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/operix',
  FRONTEND_URL: 'http://localhost:3001',
  SWAGGER_ENABLED: 'false',
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
});
