import type { ConfigService } from '@nestjs/config';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import type { PrismaService } from '../../database/prisma.service.js';
import { OPERIX_AUTH_BASE_PATH } from './auth.constant.js';

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

export type OperixAuth = ReturnType<typeof createOperixAuth>;
