export function getTestDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const databaseUrl = environment.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is required for database integration tests',
    );
  }

  return databaseUrl;
}
