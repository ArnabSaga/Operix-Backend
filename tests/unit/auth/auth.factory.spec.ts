import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/database/prisma.service';

const jestApi = import.meta.jest;

jestApi.unstable_mockModule('@better-auth/prisma-adapter', () => ({
  prismaAdapter: jestApi.fn(() => 'database-adapter'),
}));

jestApi.unstable_mockModule('better-auth', () => ({
  betterAuth: jestApi.fn((options: unknown) => ({ options })),
}));

const { createOperixAuth } =
  await import('../../../src/modules/auth/auth.factory');

describe('createOperixAuth', () => {
  it('creates Better Auth with the Operix API namespace and disabled public sign-up', () => {
    const auth = createOperixAuth(
      {} as PrismaService,
      new ConfigService({
        app: {
          nodeEnvironment: 'test',
          port: 5000,
          frontendOrigins: ['http://localhost:3000'],
          swaggerEnabled: false,
        },
        database: {
          url: 'postgresql://user:pass@localhost:5432/operix_test',
        },
        auth: {
          secret: 'test-secret-that-is-long-enough-for-auth',
          baseUrl: 'http://localhost:5000',
        },
      }),
    );

    expect(auth.options.basePath).toBe('/api/v1/auth');
    expect(auth.options.emailAndPassword).toMatchObject({
      enabled: true,
      disableSignUp: true,
    });
    expect(auth.options.user?.additionalFields).toMatchObject({
      role: {
        type: 'string',
        input: false,
      },
      status: {
        type: 'string',
        input: false,
      },
    });
  });
});
