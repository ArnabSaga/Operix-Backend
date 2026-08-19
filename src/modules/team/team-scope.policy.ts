import { UserRole } from '../../../generated/prisma/enums.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';

export function buildTeamScopeWhere(
  viewer: OperixViewer,
): Prisma.TeamWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return {};
  }

  return {
    adminId: viewer.userId,
  };
}
