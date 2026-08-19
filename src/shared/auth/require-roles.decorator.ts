import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../../generated/prisma/enums.js';
import { OPERIX_REQUIRED_ROLES_METADATA_KEY } from './auth-metadata.constant.js';

export const RequireRoles = (...roles: UserRole[]) =>
  SetMetadata(OPERIX_REQUIRED_ROLES_METADATA_KEY, roles);
