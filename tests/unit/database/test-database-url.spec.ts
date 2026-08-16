import { getTestDatabaseUrl } from '../../support/database/test-database-url';

describe('getTestDatabaseUrl', () => {
  it('returns the isolated test database URL', () => {
    expect(getTestDatabaseUrl({ TEST_DATABASE_URL: 'postgresql://test' })).toBe(
      'postgresql://test',
    );
  });

  it('rejects database integration tests without TEST_DATABASE_URL', () => {
    expect(() => getTestDatabaseUrl({})).toThrow(
      'TEST_DATABASE_URL is required for database integration tests',
    );
  });
});
