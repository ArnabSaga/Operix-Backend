import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import configuration from '../src/config/configuration.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { UserRole, UserStatus } from '../generated/prisma/enums.js';
import { createOperixSeedAuth } from '../src/modules/auth/auth.factory.js';
import {
  decideSuperAdminSeed,
  readSuperAdminSeedConfiguration,
} from '../src/modules/auth/super-admin-seed.js';

async function main(): Promise<void> {
  const seedConfiguration = readSuperAdminSeedConfiguration(process.env);
  const appConfiguration = configuration();

  if (!appConfiguration.database.url) {
    throw new Error('DATABASE_URL is required for the SUPER_ADMIN seed.');
  }

  if (!appConfiguration.auth.secret) {
    throw new Error('BETTER_AUTH_SECRET is required for the SUPER_ADMIN seed.');
  }

  if (!appConfiguration.auth.baseUrl) {
    throw new Error('BETTER_AUTH_URL is required for the SUPER_ADMIN seed.');
  }

  const configService = new ConfigService(appConfiguration);
  const prisma = new PrismaService(configService);

  try {
    const existingSuperAdmin = await prisma.user.findFirst({
      where: {
        role: UserRole.SUPER_ADMIN,
      },
      select: {
        id: true,
      },
    });

    const decision = decideSuperAdminSeed(existingSuperAdmin?.id ?? null);

    if (!decision.shouldCreate) {
      console.log('SUPER_ADMIN already exists. No seed user was created.');
      return;
    }

    const existingSeedEmail = await prisma.user.findUnique({
      where: {
        email: seedConfiguration.email,
      },
      select: {
        id: true,
      },
    });

    if (existingSeedEmail) {
      throw new Error(
        'A user with SEED_SUPER_ADMIN_EMAIL already exists but no SUPER_ADMIN exists. Refusing to modify that user automatically.',
      );
    }

    const auth = createOperixSeedAuth({
      prisma,
      baseUrl: appConfiguration.auth.baseUrl,
      secret: appConfiguration.auth.secret,
    });

    await auth.api.signUpEmail({
      body: {
        email: seedConfiguration.email,
        password: seedConfiguration.password,
        name: seedConfiguration.name,
      },
    });

    await prisma.user.update({
      where: {
        email: seedConfiguration.email,
      },
      data: {
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    console.log('SUPER_ADMIN seed user created.');
  } finally {
    await prisma.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'SUPER_ADMIN seed failed.';
  console.error(message);
  process.exitCode = 1;
});
