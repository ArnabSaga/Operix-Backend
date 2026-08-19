import type { ConfigService } from '@nestjs/config';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import type { PrismaService } from '../../database/prisma.service.js';
import { UserStatus, type UserRole } from '../../../generated/prisma/enums.js';
import { OPERIX_AUTH_BASE_PATH } from './auth.constant.js';
import {
  INITIAL_PASSWORD_MAX_LENGTH,
  INITIAL_PASSWORD_MIN_LENGTH,
} from '../user-management/user-management.constant.js';

const operixUserAdditionalFields = {
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

export function createOperixAuth(prisma: PrismaService, config: ConfigService) {
  const options = {
    basePath: OPERIX_AUTH_BASE_PATH,
    baseURL: config.getOrThrow<string>('auth.baseUrl'),
    secret: config.getOrThrow<string>('auth.secret'),
    trustedOrigins: config.getOrThrow<string[]>('app.frontendOrigins'),
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    user: {
      additionalFields: operixUserAdditionalFields,
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
}) {
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
                status: UserStatus.ACTIVE,
              },
            }),
        },
      },
    },
    user: {
      additionalFields: operixUserAdditionalFields,
    },
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

export type OperixAuth = ReturnType<typeof createOperixAuth>;
