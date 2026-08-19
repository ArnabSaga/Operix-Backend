import { UserRole } from '../../../../generated/prisma/enums.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';

export function buildMemberScopeWhere(
  viewer: OperixViewer,
): Prisma.UserWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return {
      role: UserRole.MEMBER,
    };
  }

  return {
    role: UserRole.MEMBER,
    teamMembership: {
      team: {
        adminId: viewer.userId,
      },
    },
  };
}
