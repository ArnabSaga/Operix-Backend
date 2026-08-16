const nodeEnvironments = ['development', 'test', 'production'] as const;

type NodeEnvironment = (typeof nodeEnvironments)[number];

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

function parsePort(value: unknown): number {
  const port = value === undefined ? 3000 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}

function parseBoolean(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }

  throw new Error('SWAGGER_ENABLED must be true or false');
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnvironment = requiredString(environment, 'NODE_ENV');
  if (!nodeEnvironments.includes(nodeEnvironment as NodeEnvironment)) {
    throw new Error(`NODE_ENV must be one of ${nodeEnvironments.join(', ')}`);
  }

  const databaseUrl = requiredString(environment, 'DATABASE_URL');
  const frontendUrl = requiredString(environment, 'FRONTEND_URL');
  validateUrl(databaseUrl, 'DATABASE_URL');
  for (const origin of frontendUrl.split(',').map((value) => value.trim())) {
    validateUrl(origin, 'FRONTEND_URL');
  }

  return {
    ...environment,
    NODE_ENV: nodeEnvironment,
    PORT: parsePort(environment.PORT),
    DATABASE_URL: databaseUrl,
    FRONTEND_URL: frontendUrl,
    SWAGGER_ENABLED: parseBoolean(environment.SWAGGER_ENABLED),
  };
}
