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

jestApi.unstable_mockModule('better-auth/plugins', () => ({
  customSession: jestApi.fn((transform: unknown) => ({ transform })),
}));

jestApi.unstable_mockModule('better-auth/api', () => ({
  createAuthMiddleware: jestApi.fn((handler: unknown) => handler),
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
      publicId: {
        type: 'string',
        input: false,
      },
      role: {
        type: 'string',
        input: false,
      },
      status: {
        type: 'string',
        input: false,
      },
    });
    expect(auth.options.disabledPaths).toEqual(
      expect.arrayContaining([
        '/list-sessions',
        '/update-user',
        '/delete-user',
        '/change-password',
        '/list-accounts',
      ]),
    );
    expect(
      (auth.options as { session?: { cookieCache?: unknown } }).session
        ?.cookieCache,
    ).toBeUndefined();
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

  it('keeps private identity for server auth while returning only public identity to HTTP clients', async () => {
    const auth = createOperixAuth(
      {} as PrismaService,
      new ConfigService({
        app: { frontendOrigins: ['http://localhost:3000'] },
        auth: {
          secret: 'test-secret-that-is-long-enough-for-auth',
          baseUrl: 'http://localhost:5000',
        },
      }),
      {
        sendPasswordResetEmail: jestApi.fn(),
        logPasswordResetDeliveryFailure: jestApi.fn(),
      } as unknown as MailService,
    );
    const transform = (
      auth.options.plugins?.[0] as unknown as {
        transform: (
          value: {
            user: Record<string, unknown>;
            session: Record<string, unknown>;
          },
          context: { request?: Request },
        ) => Promise<unknown>;
      }
    ).transform;
    const value = {
      user: {
        id: 'private-user-id',
        publicId: '924b5f7a-9adc-4aa5-9a25-18ba8180dbab',
        name: 'User A',
        email: 'user-a@example.com',
        emailVerified: true,
        image: null,
        role: 'ADMIN',
        status: 'ACTIVE',
        employeeId: null,
        designation: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      session: {
        id: 'private-session-id',
        userId: 'private-user-id',
        expiresAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    };

    await expect(transform(value, {})).resolves.toEqual(value);
    const publicResult = (await transform(value, {
      request: new Request('http://localhost/api/v1/auth/get-session'),
    })) as { user: Record<string, unknown>; session: Record<string, unknown> };
    expect(publicResult.user.id).toBe('924b5f7a-9adc-4aa5-9a25-18ba8180dbab');
    expect(publicResult.user.role).toBe('ADMIN');
    expect(publicResult.session).toEqual({
      expiresAt: new Date('2026-01-02T00:00:00.000Z'),
    });
  });

  it('rewrites sign-in user identity without changing the response through a global interceptor', async () => {
    const auth = createOperixAuth(
      {} as PrismaService,
      new ConfigService({
        app: { frontendOrigins: ['http://localhost:3000'] },
        auth: {
          secret: 'test-secret-that-is-long-enough-for-auth',
          baseUrl: 'http://localhost:5000',
        },
      }),
      {
        sendPasswordResetEmail: jestApi.fn(),
        logPasswordResetDeliveryFailure: jestApi.fn(),
      } as unknown as MailService,
    );
    const after = auth.options.hooks?.after as unknown as (context: {
      path: string;
      context: { returned: unknown };
      json: (body: unknown) => unknown;
    }) => Promise<unknown>;
    const json = jestApi.fn((body: unknown) => body);

    const result = await after({
      path: '/sign-in/email',
      context: {
        returned: {
          redirect: false,
          token: 'opaque-session-token',
          user: {
            id: 'private-user-id',
            publicId: '924b5f7a-9adc-4aa5-9a25-18ba8180dbab',
            name: 'User A',
          },
        },
      },
      json,
    });

    expect(result).toEqual({
      redirect: false,
      token: 'opaque-session-token',
      user: {
        id: '924b5f7a-9adc-4aa5-9a25-18ba8180dbab',
        name: 'User A',
      },
    });
    expect(JSON.stringify(result)).not.toContain('private-user-id');
  });
});
