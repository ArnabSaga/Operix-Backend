import type { Prisma } from '../../../../generated/prisma/client.js';
import { UserRole } from '../../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';

export function buildSubmissionScopeWhere(
  viewer: OperixViewer,
): Prisma.TaskSubmissionWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return {};
  }

  if (viewer.role === UserRole.ADMIN) {
    return {
      task: {
        teamId: {
          in: viewer.scope.type === 'ADMIN' ? viewer.scope.teamIds : [],
        },
      },
    };
  }

  return {
    submittedById: viewer.userId,
  };
}
