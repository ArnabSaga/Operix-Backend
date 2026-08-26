import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/database/prisma.service';
import type { MailService } from '../../../src/shared/mail/mail.service';

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
    const mailService = {
      sendPasswordResetEmail: jestApi.fn(),
      logPasswordResetDeliveryFailure: jestApi.fn(),
    };
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
      mailService as unknown as MailService,
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

  it('dispatches reset mail without returning the SMTP promise or forwarding the token', async () => {
    const neverSettles = new Promise<void>(() => undefined);
    const mailService = {
      sendPasswordResetEmail: jestApi.fn().mockReturnValue(neverSettles),
      logPasswordResetDeliveryFailure: jestApi.fn(),
    };
    const auth = createOperixAuth(
      {} as PrismaService,
      new ConfigService({
        app: {
          frontendOrigins: ['http://localhost:3000'],
        },
        auth: {
          secret: 'test-secret-that-is-long-enough-for-auth',
          baseUrl: 'http://localhost:5000',
        },
      }),
      mailService as unknown as MailService,
    );
    const sendResetPassword = auth.options.emailAndPassword?.sendResetPassword;

    expect(sendResetPassword).toBeDefined();
    if (!sendResetPassword) {
      throw new Error('sendResetPassword was not configured');
    }

    await expect(
      sendResetPassword({
        user: {
          id: 'user-a',
          name: 'User A',
          email: 'user-a@example.com',
          emailVerified: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        url: 'https://api.operix.test/reset-password/token',
        token: 'secret-token',
      }),
    ).resolves.toBeUndefined();

    expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith({
      userId: 'user-a',
      recipientName: 'User A',
      email: 'user-a@example.com',
      resetUrl: 'https://api.operix.test/reset-password/token',
    });
  });
});
