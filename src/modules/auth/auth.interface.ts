export interface SuperAdminSeedConfiguration {
  email: string;
  password: string;
  name: string;
}

export interface SuperAdminSeedEnvironment {
  SEED_SUPER_ADMIN_EMAIL?: string;
  SEED_SUPER_ADMIN_PASSWORD?: string;
  SEED_SUPER_ADMIN_NAME?: string;
}

export interface SuperAdminSeedDecision {
  shouldCreate: boolean;
  reason: 'NO_EXISTING_SUPER_ADMIN' | 'SUPER_ADMIN_ALREADY_EXISTS';
}
