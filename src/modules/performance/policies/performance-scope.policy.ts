import type { Prisma } from '../../../../generated/prisma/client.js';
import { UserRole } from '../../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';

export function buildPerformanceMemberScopeWhere(
  viewer: OperixViewer,
): Prisma.UserWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return {
      role: UserRole.MEMBER,
    };
  }

  if (viewer.role === UserRole.MEMBER) {
    return {
      id: viewer.userId,
      role: UserRole.MEMBER,
    };
  }

  return {
    role: UserRole.MEMBER,
    teamMembership: {
      teamId: {
        in: viewer.scope.type === 'ADMIN' ? viewer.scope.teamIds : [],
      },
    },
  };
}

export function buildPerformanceTeamScopeWhere(
  viewer: OperixViewer,
): Prisma.TeamWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return {};
  }

  return {
    id: {
      in: viewer.scope.type === 'ADMIN' ? viewer.scope.teamIds : [],
    },
  };
}
