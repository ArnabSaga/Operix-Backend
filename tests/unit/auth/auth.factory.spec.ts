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
    expect(auth.options.advanced).toMatchObject({
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      },
    });
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

  describe('sendResetPassword', () => {
    const buildConfig = () =>
      new ConfigService({
        app: {
          frontendOrigins: ['http://localhost:3000'],
        },
        auth: {
          secret: 'test-secret-that-is-long-enough-for-auth',
          baseUrl: 'http://localhost:5000',
        },
      });

    const buildUser = () => ({
      id: 'user-a',
      name: 'User A',
      email: 'user-a@example.com',
      emailVerified: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const settleMicrotasks = async () => {
      for (let index = 0; index < 10; index += 1) {
        await Promise.resolve();
      }
    };

    it('waits for SMTP before resolving and reports ACCEPTED', async () => {
      let releaseSend: () => void = () => undefined;
      const pendingSend = new Promise<void>((resolve) => {
        releaseSend = resolve;
      });
      const mailService = {
        sendPasswordResetEmail: jestApi.fn().mockReturnValue(pendingSend),
        sendAccountSetupEmail: jestApi.fn(),
        logPasswordResetDeliveryFailure: jestApi.fn(),
      };
      const prisma = {
        user: {
          findUnique: jestApi
            .fn()
            .mockResolvedValue({ passwordSetupRequired: false }),
        },
      };
      const sink = jestApi.fn();
      const auth = createOperixAuth(
        prisma as unknown as PrismaService,
        buildConfig(),
        mailService as unknown as MailService,
        sink,
      );
      const sendResetPassword =
        auth.options.emailAndPassword?.sendResetPassword;

      expect(sendResetPassword).toBeDefined();
      if (!sendResetPassword) {
        throw new Error('sendResetPassword was not configured');
      }

      let settled = false;
      const returned = sendResetPassword({
        user: buildUser(),
        url: 'https://api.operix.test/reset-password/token',
        token: 'secret-token',
      }).then(() => {
        settled = true;
      });

      await settleMicrotasks();
      expect(settled).toBe(false);
      expect(sink).not.toHaveBeenCalled();

      releaseSend();
      await returned;

      expect(settled).toBe(true);
      expect(sink).toHaveBeenCalledTimes(1);
      expect(sink).toHaveBeenCalledWith('ACCEPTED');
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith({
        userId: 'user-a',
        recipientName: 'User A',
        email: 'user-a@example.com',
        resetUrl: 'https://api.operix.test/reset-password/token',
      });
    });

    it('reports FAILED and logs safely when SMTP rejects', async () => {
      const deliveryError = new Error('smtp unavailable');
      const mailService = {
        sendPasswordResetEmail: jestApi.fn().mockRejectedValue(deliveryError),
        sendAccountSetupEmail: jestApi.fn(),
        logPasswordResetDeliveryFailure: jestApi.fn(),
      };
      const prisma = {
        user: {
          findUnique: jestApi
            .fn()
            .mockResolvedValue({ passwordSetupRequired: false }),
        },
      };
      const sink = jestApi.fn();
      const auth = createOperixAuth(
        prisma as unknown as PrismaService,
        buildConfig(),
        mailService as unknown as MailService,
        sink,
      );
      const sendResetPassword =
        auth.options.emailAndPassword?.sendResetPassword;

      if (!sendResetPassword) {
        throw new Error('sendResetPassword was not configured');
      }

      await expect(
        sendResetPassword({
          user: buildUser(),
          url: 'https://api.operix.test/reset-password/token',
          token: 'secret-token',
        }),
      ).resolves.toBeUndefined();

      expect(mailService.logPasswordResetDeliveryFailure).toHaveBeenCalledWith(
        'user-a',
        deliveryError,
      );
      expect(sink).toHaveBeenCalledTimes(1);
      expect(sink).toHaveBeenCalledWith('FAILED');
    });

    it('uses the account setup template while setup is still pending', async () => {
      const mailService = {
        sendPasswordResetEmail: jestApi.fn(),
        sendAccountSetupEmail: jestApi.fn().mockResolvedValue(undefined),
        logPasswordResetDeliveryFailure: jestApi.fn(),
      };
      const prisma = {
        user: {
          findUnique: jestApi
            .fn()
            .mockResolvedValue({ passwordSetupRequired: true }),
        },
      };
      const sink = jestApi.fn();
      const auth = createOperixAuth(
        prisma as unknown as PrismaService,
        buildConfig(),
        mailService as unknown as MailService,
        sink,
      );
      const sendResetPassword =
        auth.options.emailAndPassword?.sendResetPassword;

      if (!sendResetPassword) {
        throw new Error('sendResetPassword was not configured');
      }

      await sendResetPassword({
        user: buildUser(),
        url: 'https://api.operix.test/reset-password/token',
        token: 'secret-token',
      });

      expect(mailService.sendAccountSetupEmail).toHaveBeenCalledWith({
        userId: 'user-a',
        recipientName: 'User A',
        email: 'user-a@example.com',
        setupUrl: 'https://api.operix.test/reset-password/token',
      });
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(sink).toHaveBeenCalledWith('ACCEPTED');
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

  describe('onPasswordReset', () => {
    const buildAuth = (tx: Record<string, unknown>) => {
      const prisma = {
        $transaction: jestApi.fn(
          (callback: (transaction: unknown) => Promise<unknown>) =>
            callback(tx),
        ),
      };

      return createOperixAuth(
        prisma as unknown as PrismaService,
        new ConfigService({
          app: { frontendOrigins: ['http://localhost:3000'] },
          auth: {
            secret: 'test-secret-that-is-long-enough-for-auth',
            baseUrl: 'http://localhost:5000',
          },
        }),
        {
          sendPasswordResetEmail: jestApi.fn(),
          sendAccountSetupEmail: jestApi.fn(),
          logPasswordResetDeliveryFailure: jestApi.fn(),
        } as unknown as MailService,
      );
    };

    const user = {
      id: 'active-user-id',
      name: 'Active User',
      email: 'active@example.com',
      emailVerified: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('leaves an ordinary active user out of the onboarding activation flow', async () => {
      const tx = {
        user: {
          updateMany: jestApi.fn().mockResolvedValue({ count: 0 }),
          findFirst: jestApi.fn(),
        },
        registrationRequest: {
          update: jestApi.fn(),
          findUnique: jestApi.fn(),
        },
        activityLog: {
          create: jestApi.fn(),
        },
      };
      const auth = buildAuth(tx);
      const onPasswordReset = auth.options.emailAndPassword?.onPasswordReset;

      if (!onPasswordReset) {
        throw new Error('onPasswordReset was not configured');
      }

      await onPasswordReset({ user });

      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: 'INACTIVE',
          passwordSetupRequired: true,
          registrationRequestId: { not: null },
        }) as unknown,
        data: {
          status: 'ACTIVE',
          passwordSetupRequired: false,
        },
      });
      expect(tx.registrationRequest.update).not.toHaveBeenCalled();
      expect(tx.activityLog.create).not.toHaveBeenCalled();
    });

    it('activates a setup-pending registration after the first password reset', async () => {
      const tx = {
        user: {
          updateMany: jestApi.fn().mockResolvedValue({ count: 1 }),
          findFirst: jestApi
            .fn()
            .mockResolvedValue({ registrationRequestId: 'request-id' }),
        },
        registrationRequest: {
          update: jestApi.fn().mockResolvedValue({ id: 'request-id' }),
          findUnique: jestApi
            .fn()
            .mockResolvedValue({ publicId: 'request-public-id' }),
        },
        activityLog: {
          create: jestApi.fn().mockResolvedValue({ id: 'activity-id' }),
        },
      };
      const auth = buildAuth(tx);
      const onPasswordReset = auth.options.emailAndPassword?.onPasswordReset;

      if (!onPasswordReset) {
        throw new Error('onPasswordReset was not configured');
      }

      await onPasswordReset({ user });

      expect(tx.registrationRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-id' },
        data: { passwordConfiguredAt: expect.any(Date) as Date },
      });
      expect(tx.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'REGISTRATION_PASSWORD_CONFIGURED',
          entityType: 'REGISTRATION_REQUEST',
          entityId: 'request-id',
        }) as unknown,
      });
    });
  });
});
