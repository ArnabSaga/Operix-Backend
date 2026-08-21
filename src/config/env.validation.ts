const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;

type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

function requiredString(
  environment: Record<string, unknown>,
  key: string,
): string {
  const value = environment[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }

  return value.trim();
}

function validateUrl(value: string, key: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
}

function validateEmail(value: string, key: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`${key} must be a valid email address`);
  }
}

function parsePort(value: unknown): number {
  if (value === undefined) {
    return 5000;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}

function parseRequiredPort(value: unknown, key: string): number {
  if (value === undefined || value === '') {
    throw new Error(`${key} is required when SMTP_ENABLED is true`);
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${key} must be an integer between 1 and 65535`);
  }

  return port;
}

function parseBoolean(
  value: unknown,
  key: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  throw new Error(`${key} must be true or false`);
}

function validateNodeEnvironment(value: string): NodeEnvironment {
  if (!NODE_ENVIRONMENTS.includes(value as NodeEnvironment)) {
    throw new Error(`NODE_ENV must be one of: ${NODE_ENVIRONMENTS.join(', ')}`);
  }

  return value as NodeEnvironment;
}

function validateFrontendOrigins(value: string): string {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('FRONTEND_URL must contain at least one origin');
  }

  for (const origin of origins) {
    validateUrl(origin, 'FRONTEND_URL');
  }

  return origins.join(',');
}

function validateBetterAuthSecret(value: string): string {
  if (value.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters long');
  }

  return value;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnvironment = validateNodeEnvironment(
    requiredString(environment, 'NODE_ENV'),
  );

  const databaseUrl = requiredString(environment, 'DATABASE_URL');

  const frontendUrl = validateFrontendOrigins(
    requiredString(environment, 'FRONTEND_URL'),
  );

  const frontendAppUrl = requiredString(environment, 'FRONTEND_APP_URL');

  const betterAuthSecret = validateBetterAuthSecret(
    requiredString(environment, 'BETTER_AUTH_SECRET'),
  );

  const betterAuthUrl = requiredString(environment, 'BETTER_AUTH_URL');

  validateUrl(databaseUrl, 'DATABASE_URL');

  validateUrl(frontendAppUrl, 'FRONTEND_APP_URL');

  validateUrl(betterAuthUrl, 'BETTER_AUTH_URL');

  const smtpEnabled = parseBoolean(
    environment.SMTP_ENABLED,
    'SMTP_ENABLED',
    false,
  );
  const smtpSecure = parseBoolean(
    environment.SMTP_SECURE,
    'SMTP_SECURE',
    false,
  );
  const smtpPort = smtpEnabled
    ? parseRequiredPort(environment.SMTP_PORT, 'SMTP_PORT')
    : environment.SMTP_PORT === undefined || environment.SMTP_PORT === ''
      ? null
      : parseRequiredPort(environment.SMTP_PORT, 'SMTP_PORT');
  const smtpHost = smtpEnabled
    ? requiredString(environment, 'SMTP_HOST')
    : typeof environment.SMTP_HOST === 'string'
      ? environment.SMTP_HOST.trim()
      : '';
  const smtpUser = smtpEnabled
    ? requiredString(environment, 'SMTP_USER')
    : typeof environment.SMTP_USER === 'string'
      ? environment.SMTP_USER.trim()
      : '';
  const smtpPass = smtpEnabled
    ? requiredString(environment, 'SMTP_PASS')
    : typeof environment.SMTP_PASS === 'string'
      ? environment.SMTP_PASS
      : '';
  const smtpFromEmail = smtpEnabled
    ? requiredString(environment, 'SMTP_FROM_EMAIL')
    : typeof environment.SMTP_FROM_EMAIL === 'string'
      ? environment.SMTP_FROM_EMAIL.trim()
      : '';
  const smtpFromName =
    typeof environment.SMTP_FROM_NAME === 'string' &&
    environment.SMTP_FROM_NAME.trim().length > 0
      ? environment.SMTP_FROM_NAME.trim()
      : 'Operix';

  if (smtpEnabled) {
    validateEmail(smtpFromEmail, 'SMTP_FROM_EMAIL');
  }

  return {
    ...environment,

    NODE_ENV: nodeEnvironment,

    PORT: parsePort(environment.PORT),

    DATABASE_URL: databaseUrl,

    FRONTEND_URL: frontendUrl,

    FRONTEND_APP_URL: frontendAppUrl,

    BETTER_AUTH_SECRET: betterAuthSecret,

    BETTER_AUTH_URL: betterAuthUrl,

    SWAGGER_ENABLED: parseBoolean(
      environment.SWAGGER_ENABLED,
      'SWAGGER_ENABLED',
      true,
    ),

    SMTP_ENABLED: smtpEnabled,

    SMTP_HOST: smtpHost,

    SMTP_PORT: smtpPort,

    SMTP_SECURE: smtpSecure,

    SMTP_USER: smtpUser,

    SMTP_PASS: smtpPass,

    SMTP_FROM_EMAIL: smtpFromEmail,

    SMTP_FROM_NAME: smtpFromName,
  };
}
