import { BadRequestException } from '@nestjs/common';
import { SUPER_ADMIN_SEED_PASSWORD_MIN_LENGTH } from './auth.constant.js';
import type {
  SuperAdminSeedConfiguration,
  SuperAdminSeedDecision,
  SuperAdminSeedEnvironment,
} from './auth.interface.js';

export function readSuperAdminSeedConfiguration(
  environment: SuperAdminSeedEnvironment,
): SuperAdminSeedConfiguration {
  const email = environment.SEED_SUPER_ADMIN_EMAIL?.trim() ?? '';
  const password = environment.SEED_SUPER_ADMIN_PASSWORD ?? '';
  const name = environment.SEED_SUPER_ADMIN_NAME?.trim() ?? '';

  if (!email) {
    throw new BadRequestException('SEED_SUPER_ADMIN_EMAIL is required.');
  }

  if (!password) {
    throw new BadRequestException('SEED_SUPER_ADMIN_PASSWORD is required.');
  }

  if (password.length < SUPER_ADMIN_SEED_PASSWORD_MIN_LENGTH) {
    throw new BadRequestException(
      `SEED_SUPER_ADMIN_PASSWORD must be at least ${SUPER_ADMIN_SEED_PASSWORD_MIN_LENGTH} characters.`,
    );
  }

  if (!name) {
    throw new BadRequestException('SEED_SUPER_ADMIN_NAME is required.');
  }

  return {
    email,
    password,
    name,
  };
}

export function decideSuperAdminSeed(
  existingSuperAdminId: string | null,
): SuperAdminSeedDecision {
  if (existingSuperAdminId) {
    return {
      shouldCreate: false,
      reason: 'SUPER_ADMIN_ALREADY_EXISTS',
    };
  }

  return {
    shouldCreate: true,
    reason: 'NO_EXISTING_SUPER_ADMIN',
  };
}
