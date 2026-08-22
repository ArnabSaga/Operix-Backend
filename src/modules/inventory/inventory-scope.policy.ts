import type { Prisma } from '../../../generated/prisma/client.js';
import { UserRole } from '../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';

export function getInventoryScopedTeamIds(viewer: OperixViewer): string[] {
  return viewer.role === UserRole.ADMIN && viewer.scope.type === 'ADMIN'
    ? viewer.scope.teamIds
    : [];
}

export function buildInventoryItemScopeWhere(
  viewer: OperixViewer,
): Prisma.InventoryItemWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return {};
  }

  if (viewer.role === UserRole.ADMIN) {
    return {
      teamId: {
        in: getInventoryScopedTeamIds(viewer),
      },
    };
  }

  return {
    id: {
      equals: '__no_member_inventory_item_scope__',
    },
  };
}

export function buildInventoryAssignmentScopeWhere(
  viewer: OperixViewer,
): Prisma.InventoryAssignmentWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return {};
  }

  if (viewer.role === UserRole.ADMIN) {
    return {
      item: {
        teamId: {
          in: getInventoryScopedTeamIds(viewer),
        },
      },
    };
  }

  return {
    memberId: viewer.userId,
  };
}

export function buildInventoryTransactionScopeWhere(
  viewer: OperixViewer,
): Prisma.InventoryTransactionWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return {};
  }

  if (viewer.role === UserRole.ADMIN) {
    return {
      item: {
        teamId: {
          in: getInventoryScopedTeamIds(viewer),
        },
      },
    };
  }

  return {
    id: {
      equals: '__no_member_inventory_transaction_scope__',
    },
  };
}
