import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { customSession } from 'better-auth/plugins';
import type { PrismaService } from '../../database/prisma.service.js';
import { PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS } from '../../shared/auth/password-reset.constant.js';
import type { MailService } from '../../shared/mail/mail.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import { UserStatus, type UserRole } from '../../../generated/prisma/enums.js';
import { OPERIX_AUTH_BASE_PATH } from './auth.constant.js';
import {
  INITIAL_PASSWORD_MAX_LENGTH,
  INITIAL_PASSWORD_MIN_LENGTH,
} from './password-policy.constant.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function userWhereById(id: string) {
  return UUID_REGEX.test(id) ? { OR: [{ id }, { publicId: id }] } : { id };
}

const operixUserAdditionalFields = {
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
  employeeId: {
    type: 'string',
    required: false,
    input: false,
  },
  designation: {
    type: 'string',
    required: false,
    input: false,
  },
} as const;

export function createOperixAuth(
  prisma: PrismaService,
  config: ConfigService,
  mailService: MailService,
) {
  const logger = new Logger('OperixAuth');
  const options = {
    basePath: OPERIX_AUTH_BASE_PATH,
    baseURL: config.getOrThrow<string>('auth.baseUrl'),
    secret: config.getOrThrow<string>('auth.secret'),
    trustedOrigins: config.getOrThrow<string[]>('app.frontendOrigins'),
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      },
    },
    disabledPaths: [
      '/list-sessions',
      '/revoke-session',
      '/revoke-sessions',
      '/revoke-other-sessions',
      '/update-user',
      '/delete-user',
      '/change-email',
      '/change-password',
      '/set-password',
      '/list-accounts',
      '/link-social',
      '/unlink-account',
      '/refresh-token',
    ],
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS,
      sendResetPassword: async ({ user, url }) => {
        const lifecycle = prisma.user?.findUnique
          ? await prisma.user.findUnique({
              where: { id: user.id },
              select: { passwordSetupRequired: true },
            })
          : null;
        const delivery = lifecycle?.passwordSetupRequired
          ? mailService.sendAccountSetupEmail({
              userId: user.id,
              recipientName: user.name,
              email: user.email,
              setupUrl: url,
            })
          : mailService.sendPasswordResetEmail({
              userId: user.id,
              recipientName: user.name,
              email: user.email,
              resetUrl: url,
            });
        void delivery.catch((error: unknown) => {
          mailService.logPasswordResetDeliveryFailure(user.id, error);
        });
        await Promise.resolve();
      },
      onPasswordReset: async ({ user }) => {
        try {
          await prisma.$transaction(async (tx) => {
            const transitioned = await tx.user.updateMany({
              where: {
                ...userWhereById(user.id),
                status: UserStatus.INACTIVE,
                passwordSetupRequired: true,
                registrationRequestId: { not: null },
              },
              data: {
                status: UserStatus.ACTIVE,
                passwordSetupRequired: false,
              },
            });
            if (transitioned.count !== 1) return;
            const activated = await tx.user.findFirst({
              where: userWhereById(user.id),
              select: { registrationRequestId: true, id: true },
            });
            if (!activated?.registrationRequestId) return;
            await tx.registrationRequest.update({
              where: { id: activated.registrationRequestId },
              data: { passwordConfiguredAt: new Date() },
            });
            await writeActivity(tx, {
              actorId: user.id,
              action: 'REGISTRATION_PASSWORD_CONFIGURED',
              entityType: 'REGISTRATION_REQUEST',
              entityId: activated.registrationRequestId,
            });
          });
        } catch (error) {
          logger.error('Registration activation after password reset failed.', {
            eventId: user.id,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      },
    },
    user: {
      additionalFields: operixUserAdditionalFields,
    },
    plugins: [
      customSession<Record<string, unknown>>(({ user, session }, context) => {
        // nestjs-better-auth resolves guards through the server-side auth API.
        // Preserve that private identity for authorization while sanitizing the
        // browser-facing Better Auth handler response below. In Better Auth
        // 1.6.29 a handler invocation carries the originating Request; a direct
        // auth.api invocation does not.
        if (!context.request) {
          return Promise.resolve({ user, session });
        }

        const operixUser = user as typeof user & {
          publicId: string;
          role: UserRole;
          status: UserStatus;
          employeeId: string | null;
          designation: string | null;
        };

        return Promise.resolve({
          user: {
            id: operixUser.publicId,
            name: operixUser.name,
            email: operixUser.email,
            emailVerified: operixUser.emailVerified,
            image: operixUser.image,
            role: operixUser.role,
            status: operixUser.status,
            employeeId: operixUser.employeeId,
            designation: operixUser.designation,
            createdAt: operixUser.createdAt,
            updatedAt: operixUser.updatedAt,
          },
          session: { expiresAt: session.expiresAt },
        });
      }),
    ],
    hooks: {
      after: createAuthMiddleware(async (context) => {
        if (context.path !== '/sign-in/email') {
          return;
        }
        const returned = context.context.returned;
        if (
          !returned ||
          typeof returned !== 'object' ||
          !('user' in returned)
        ) {
          return;
        }

        const response = returned as {
          user?: Record<string, unknown>;
        } & Record<string, unknown>;
        if (!response.user || typeof response.user.publicId !== 'string') {
          return;
        }

        const { publicId, ...safeUser } = response.user;
        return context.json({
          ...response,
          user: { ...safeUser, id: publicId },
        });
      }),
    },
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

export function createOperixSeedAuth(seedOptions: {
  prisma: PrismaService;
  baseUrl: string;
  secret: string;
}) {
  const options = {
    basePath: OPERIX_AUTH_BASE_PATH,
    baseURL: seedOptions.baseUrl,
    secret: seedOptions.secret,
    database: prismaAdapter(seedOptions.prisma, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
    },
    user: {
      additionalFields: operixUserAdditionalFields,
    },
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

export function createOperixProvisioningAuth(provisioningOptions: {
  prisma: PrismaService;
  baseUrl: string;
  secret: string;
  forcedRole: UserRole;
  forcedStatus?: UserStatus;
}) {
  let createdUserId: string | null = null;

  const options = {
    basePath: OPERIX_AUTH_BASE_PATH,
    baseURL: provisioningOptions.baseUrl,
    secret: provisioningOptions.secret,
    database: prismaAdapter(provisioningOptions.prisma, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      autoSignIn: false,
      minPasswordLength: INITIAL_PASSWORD_MIN_LENGTH,
      maxPasswordLength: INITIAL_PASSWORD_MAX_LENGTH,
    },
    databaseHooks: {
      user: {
        create: {
          before: (user) =>
            Promise.resolve({
              data: {
                ...user,
                role: provisioningOptions.forcedRole,
                status: provisioningOptions.forcedStatus ?? UserStatus.ACTIVE,
              },
            }),
          after: (user) => {
            createdUserId = user.id;
            return Promise.resolve();
          },
        },
      },
    },
    user: {
      additionalFields: operixUserAdditionalFields,
    },
  } satisfies BetterAuthOptions;

  return {
    auth: betterAuth(options),
    getCreatedUserId: () => createdUserId,
  };
}

export type OperixAuth = ReturnType<typeof createOperixAuth>;
