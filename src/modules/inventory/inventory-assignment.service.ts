import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  InventoryTransactionType,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import type { PrismaTransactionClient } from '../../shared/database/transaction-client.type.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { createNotification } from '../../shared/notification/notification-write.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import type { AssignInventoryDto } from './dto/assign-inventory.dto.js';
import type { InventoryAssignmentQueryDto } from './dto/inventory-assignment-query.dto.js';
import type { ReturnInventoryDto } from './dto/return-inventory.dto.js';
import {
  InventoryReturnStatus,
  INVENTORY_ACTIVITY,
  INVENTORY_ERROR_CODE,
  INVENTORY_NOTIFICATION,
} from './inventory.constant.js';
import type {
  PaginatedInventoryAssignmentResponse,
  SafeInventoryAssignmentResponse,
} from './inventory.interface.js';
import {
  buildInventoryAssignmentScopeWhere,
  buildInventoryItemScopeWhere,
  getInventoryScopedTeamIds,
} from './inventory-scope.policy.js';
import { mapInventoryAssignmentResponse } from './inventory.mapper.js';
import { inventoryAssignmentSelect } from './inventory.select.js';
import { throwInventoryItemNotFound } from './inventory-item.service.js';
import { throwInsufficientStock } from './inventory-stock.service.js';

@Injectable()
export class InventoryAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(
    viewer: OperixViewer,
    itemId: string,
    dto: AssignInventoryDto,
  ): Promise<SafeInventoryAssignmentResponse> {
    this.assertAssignmentManager(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: {
          id: itemId,
          AND: [buildInventoryItemScopeWhere(viewer)],
        },
        select: {
          id: true,
          teamId: true,
          quantity: true,
          isActive: true,
          isReturnable: true,
        },
      });

      if (!item) {
        throwInventoryItemNotFound();
      }

      if (!item.isActive) {
        throw new AppException(
          HttpStatus.CONFLICT,
          INVENTORY_ERROR_CODE.INVENTORY_ITEM_INACTIVE,
          'Inactive inventory items cannot be assigned.',
        );
      }

      if (!item.isReturnable) {
        throw new AppException(
          HttpStatus.CONFLICT,
          INVENTORY_ERROR_CODE.INVENTORY_ITEM_NOT_RETURNABLE,
          'Inventory item is not returnable.',
        );
      }

      if (dto.quantity > item.quantity) {
        throwInsufficientStock();
      }

      await this.assertActiveMemberInTeam(tx, dto.memberId, item.teamId);

      const resultingQuantity = item.quantity - dto.quantity;

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: resultingQuantity },
        select: { id: true },
      });

      const assignmentRow = await tx.inventoryAssignment.create({
        data: {
          itemId: item.id,
          memberId: dto.memberId,
          assignedById: viewer.userId,
          quantity: dto.quantity,
          note: dto.note ?? null,
        },
        select: {
          id: true,
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          itemId: item.id,
          type: InventoryTransactionType.ASSIGN,
          quantity: dto.quantity,
          previousQuantity: item.quantity,
          resultingQuantity,
          actorId: viewer.userId,
          memberId: dto.memberId,
          assignmentId: assignmentRow.id,
          note: dto.note ?? null,
        },
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: INVENTORY_ACTIVITY.INVENTORY_ASSIGNED,
        entityType: 'INVENTORY_ASSIGNMENT',
        entityId: assignmentRow.id,
        metadata: {
          itemId: item.id,
          assignmentId: assignmentRow.id,
          memberId: dto.memberId,
          teamId: item.teamId,
          quantity: dto.quantity,
        },
      });

      await createNotification(tx, {
        receiverId: dto.memberId,
        actorId: viewer.userId,
        type: INVENTORY_NOTIFICATION.INVENTORY_ASSIGNED,
        title: INVENTORY_NOTIFICATION.ASSIGNED_TITLE,
        body: INVENTORY_NOTIFICATION.ASSIGNED_BODY,
        targetType: INVENTORY_NOTIFICATION.TARGET_ASSIGNMENT,
        targetId: assignmentRow.id,
      });

      const assignment = await tx.inventoryAssignment.findUniqueOrThrow({
        where: { id: assignmentRow.id },
        select: inventoryAssignmentSelect,
      });

      return mapInventoryAssignmentResponse(assignment);
    });
  }

  async listAssignments(
    viewer: OperixViewer,
    query: InventoryAssignmentQueryDto,
  ): Promise<PaginatedInventoryAssignmentResponse> {
    const normalized = normalizePagination(query);
    const where = this.buildAssignmentWhere(viewer, query);

    const [data, total] = await Promise.all([
      this.prisma.inventoryAssignment.findMany({
        where,
        select: inventoryAssignmentSelect,
        orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.inventoryAssignment.count({ where }),
    ]);

    return {
      data: data.map(mapInventoryAssignmentResponse),
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  async getAssignment(
    viewer: OperixViewer,
    assignmentId: string,
  ): Promise<SafeInventoryAssignmentResponse> {
    const assignment = await this.prisma.inventoryAssignment.findFirst({
      where: {
        id: assignmentId,
        AND: [buildInventoryAssignmentScopeWhere(viewer)],
      },
      select: inventoryAssignmentSelect,
    });

    if (!assignment) {
      throwInventoryAssignmentNotFound();
    }

    return mapInventoryAssignmentResponse(assignment);
  }

  async returnInventory(
    viewer: OperixViewer,
    assignmentId: string,
    dto: ReturnInventoryDto,
  ): Promise<SafeInventoryAssignmentResponse> {
    this.assertAssignmentManager(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const assignment = await tx.inventoryAssignment.findFirst({
        where: {
          id: assignmentId,
          AND: [buildInventoryAssignmentScopeWhere(viewer)],
        },
        select: {
          id: true,
          itemId: true,
          memberId: true,
          quantity: true,
          returnedQuantity: true,
          item: {
            select: {
              id: true,
              teamId: true,
              quantity: true,
            },
          },
        },
      });

      if (!assignment) {
        throwInventoryAssignmentNotFound();
      }

      const remainingQuantity =
        assignment.quantity - assignment.returnedQuantity;

      if (remainingQuantity === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          INVENTORY_ERROR_CODE.INVENTORY_ASSIGNMENT_ALREADY_RETURNED,
          'Inventory assignment is already fully returned.',
        );
      }

      if (dto.quantity > remainingQuantity) {
        throw new AppException(
          HttpStatus.CONFLICT,
          INVENTORY_ERROR_CODE.INVENTORY_RETURN_QUANTITY_EXCEEDS_OUTSTANDING,
          'Return quantity exceeds outstanding quantity.',
        );
      }

      const newReturnedQuantity = assignment.returnedQuantity + dto.quantity;
      const fullyReturned = newReturnedQuantity === assignment.quantity;
      const resultingQuantity = assignment.item.quantity + dto.quantity;
      const now = new Date();

      await tx.inventoryItem.update({
        where: { id: assignment.itemId },
        data: { quantity: resultingQuantity },
        select: { id: true },
      });

      await tx.inventoryAssignment.update({
        where: { id: assignment.id },
        data: {
          returnedQuantity: newReturnedQuantity,
          returnedAt: fullyReturned ? now : null,
        },
        select: { id: true },
      });

      await tx.inventoryTransaction.create({
        data: {
          itemId: assignment.itemId,
          type: InventoryTransactionType.RETURN,
          quantity: dto.quantity,
          previousQuantity: assignment.item.quantity,
          resultingQuantity,
          actorId: viewer.userId,
          memberId: assignment.memberId,
          assignmentId: assignment.id,
          note: dto.note ?? null,
        },
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: INVENTORY_ACTIVITY.INVENTORY_RETURNED,
        entityType: 'INVENTORY_ASSIGNMENT',
        entityId: assignment.id,
        metadata: {
          itemId: assignment.itemId,
          assignmentId: assignment.id,
          memberId: assignment.memberId,
          teamId: assignment.item.teamId,
          quantity: dto.quantity,
          resultingQuantity,
        },
      });

      const updated = await tx.inventoryAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        select: inventoryAssignmentSelect,
      });

      return mapInventoryAssignmentResponse(updated);
    });
  }

  private buildAssignmentWhere(
    viewer: OperixViewer,
    query: InventoryAssignmentQueryDto,
  ): Prisma.InventoryAssignmentWhereInput {
    const filters: Prisma.InventoryAssignmentWhereInput[] = [
      buildInventoryAssignmentScopeWhere(viewer),
    ];

    if (viewer.role === UserRole.MEMBER) {
      if (query.teamId || query.memberId) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          APP_ERROR_CODE.FORBIDDEN,
          'You do not have access to this assignment filter.',
        );
      }
    }

    if (query.teamId) {
      if (
        viewer.role === UserRole.ADMIN &&
        !getInventoryScopedTeamIds(viewer).includes(query.teamId)
      ) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          APP_ERROR_CODE.FORBIDDEN,
          'You do not have access to this Team inventory.',
        );
      }
      filters.push({ item: { teamId: query.teamId } });
    }

    if (query.memberId) {
      filters.push({ memberId: query.memberId });
    }

    if (query.itemId) {
      filters.push({ itemId: query.itemId });
    }

    if (query.returnStatus) {
      filters.push(buildReturnStatusWhere(query.returnStatus));
    }

    if (query.from || query.to) {
      filters.push({
        assignedAt: {
          gte: query.from,
          lte: query.to,
        },
      });
    }

    return { AND: filters };
  }

  private assertAssignmentManager(viewer: OperixViewer): void {
    if (
      viewer.role === UserRole.SUPER_ADMIN ||
      viewer.role === UserRole.ADMIN
    ) {
      return;
    }

    throw new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to inventory assignment mutations.',
    );
  }

  private async assertActiveMemberInTeam(
    tx: PrismaTransactionClient,
    memberId: string,
    teamId: string,
  ): Promise<void> {
    const member = await tx.user.findUnique({
      where: { id: memberId },
      select: {
        role: true,
        status: true,
        teamMembership: {
          select: {
            teamId: true,
          },
        },
      },
    });

    if (member?.role !== UserRole.MEMBER) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        INVENTORY_ERROR_CODE.INVENTORY_MEMBER_NOT_FOUND,
        'Inventory member was not found.',
      );
    }

    if (member.status !== UserStatus.ACTIVE) {
      throw new AppException(
        HttpStatus.CONFLICT,
        INVENTORY_ERROR_CODE.INVENTORY_MEMBER_NOT_ACTIVE,
        'Inventory can only be assigned to an active Member.',
      );
    }

    if (member.teamMembership?.teamId !== teamId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        INVENTORY_ERROR_CODE.INVENTORY_MEMBER_TEAM_MISMATCH,
        'Member does not belong to the inventory item Team.',
      );
    }
  }
}

function buildReturnStatusWhere(
  status: InventoryReturnStatus,
): Prisma.InventoryAssignmentWhereInput {
  if (status === InventoryReturnStatus.OUTSTANDING) {
    return { returnedQuantity: 0 };
  }

  if (status === InventoryReturnStatus.RETURNED) {
    return {
      returnedQuantity: {
        gt: 0,
      },
      returnedAt: {
        not: null,
      },
    };
  }

  return {
    returnedQuantity: {
      gt: 0,
      lt: 999999999,
    },
    returnedAt: null,
  };
}

export function throwInventoryAssignmentNotFound(): never {
  throw new AppException(
    HttpStatus.NOT_FOUND,
    INVENTORY_ERROR_CODE.INVENTORY_ASSIGNMENT_NOT_FOUND,
    'Inventory assignment was not found.',
  );
}
