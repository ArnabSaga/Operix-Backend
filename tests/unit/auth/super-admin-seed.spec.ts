import { BadRequestException } from '@nestjs/common';
import {
  decideSuperAdminSeed,
  readSuperAdminSeedConfiguration,
} from '../../../src/modules/auth/super-admin-seed';

describe('super admin seed helpers', () => {
  it('refuses missing seed environment', () => {
    expect(() => readSuperAdminSeedConfiguration({})).toThrow(
      BadRequestException,
    );
  });

  it('normalizes a valid seed configuration without printing secrets', () => {
    expect(
      readSuperAdminSeedConfiguration({
        SEED_SUPER_ADMIN_EMAIL: ' chief@example.com ',
        SEED_SUPER_ADMIN_PASSWORD: 'safe-password',
        SEED_SUPER_ADMIN_NAME: ' Chief ',
      }),
    ).toEqual({
      email: 'chief@example.com',
      password: 'safe-password',
      name: 'Chief',
    });
  });

  it('no-ops when a SUPER_ADMIN already exists', () => {
    expect(decideSuperAdminSeed('user-a')).toEqual({
      shouldCreate: false,
      reason: 'SUPER_ADMIN_ALREADY_EXISTS',
    });
  });

  it('allows creation when no SUPER_ADMIN exists', () => {
    expect(decideSuperAdminSeed(null)).toEqual({
      shouldCreate: true,
      reason: 'NO_EXISTING_SUPER_ADMIN',
    });
  });
});
