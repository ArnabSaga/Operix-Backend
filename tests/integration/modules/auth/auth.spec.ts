import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '../../../../src/database/prisma.service';
import { UserRole, UserStatus } from '../../../../generated/prisma/enums';
import { createOperixSeedAuth } from '../../../../src/modules/auth/auth.factory';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';
import { createTestApplication } from '../../../support/server/create-test-application';

describe('Auth integration', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaService | undefined;
  let seededEmail: string | undefined;
  const seededPassword = 'seeded-password';

  beforeAll(async () => {
    const databaseUrl = getTestDatabaseUrl();
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = databaseUrl;
    process.env.FRONTEND_URL = 'http://localhost:3001';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-auth';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';

    seededEmail = `auth-${randomUUID()}@operix.test`;
    prisma = new PrismaService(
      new ConfigService({
        database: {
          url: databaseUrl,
        },
      }),
    );

    const seedAuth = createOperixSeedAuth({
      prisma,
      baseUrl: process.env.BETTER_AUTH_URL,
      secret: process.env.BETTER_AUTH_SECRET,
    });

    await seedAuth.api.signUpEmail({
      body: {
        email: seededEmail,
        password: seededPassword,
        name: 'Auth Integration Chief',
      },
    });

    await prisma.user.update({
      where: {
        email: seededEmail,
      },
      data: {
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    app = await createTestApplication();
  });

  afterAll(async () => {
    await app?.close();

    if (prisma && seededEmail) {
      await prisma.user.deleteMany({
        where: {
          email: seededEmail,
        },
      });
      await prisma.onModuleDestroy();
    }
  });

  it('disables public email sign-up', async () => {
    const testApp = getApplication(app);

    await request(testApp.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .send({
        email: 'public-signup@example.com',
        password: 'safe-password',
        name: 'Public Signup',
      })
      .expect(403);
  });

  it('signs in, reads the Better Auth session, returns Operix viewer, and signs out', async () => {
    const testApp = getApplication(app);
    const agent = request.agent(testApp.getHttpServer());

    await agent
      .post('/api/v1/auth/sign-in/email')
      .send({
        email: seededEmail,
        password: seededPassword,
      })
      .expect(200);

    const sessionResponse = await agent
      .get('/api/v1/auth/get-session')
      .expect(200);

    expect(sessionResponse.body).toMatchObject({
      user: {
        email: seededEmail,
      },
    });

    await agent
      .get('/api/v1/auth/me')
      .expect(200)
      .expect((response) => {
        const body = response.body as unknown;
        const viewer = body as {
          userId?: unknown;
          role?: unknown;
          status?: unknown;
          scope?: unknown;
        };

        expect(typeof viewer.userId).toBe('string');
        expect(viewer.role).toBe(UserRole.SUPER_ADMIN);
        expect(viewer.status).toBe(UserStatus.ACTIVE);
        expect(viewer.scope).toEqual({ type: 'GLOBAL' });
      });

    await agent.post('/api/v1/auth/sign-out').expect(200);

    const signedOutSession = await agent
      .get('/api/v1/auth/get-session')
      .expect(200);

    expect(signedOutSession.body).toBeNull();
  });

  it('uses a test bootstrap configured for disabled Nest body parsing', () => {
    expect(app).toBeDefined();
  });
});

function getApplication(
  application: NestExpressApplication | undefined,
): NestExpressApplication {
  if (!application) {
    throw new Error('Nest test application was not initialized');
  }

  return application;
}
