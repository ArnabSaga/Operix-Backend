import type { Prisma } from '../../../../generated/prisma/client.js';
import { UserRole } from '../../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';

export function buildManagementReportScopeWhere(
  viewer: OperixViewer,
): Prisma.ManagementReportWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return {};
  }

  return {
    adminId: viewer.userId,
  };
}
