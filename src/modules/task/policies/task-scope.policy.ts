import type { Prisma } from '../../../../generated/prisma/client.js';
import { UserRole } from '../../../../generated/prisma/enums.js';
import { TaskScope } from '../../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';

export function buildTaskScopeWhere(
  viewer: OperixViewer,
): Prisma.TaskWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return {};
  }

  if (viewer.role === UserRole.ADMIN) {
    return {
      teamId: {
        in: viewer.scope.type === 'ADMIN' ? viewer.scope.teamIds : [],
      },
    };
  }

  return {
    assignments: {
      some: {
        responsibleUserId: viewer.userId,
        unassignedAt: null,
      },
    },
  };
}

export function buildTaskArtifactScopeWhere(
  viewer: OperixViewer,
): Prisma.TaskWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) return {};
  return {
    OR: [
      { scope: TaskScope.GLOBAL },
      {
        scope: TaskScope.TEAM,
        AND: [buildTaskScopeWhere(viewer)],
      },
    ],
  };
}
