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
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import type { InventoryAdjustmentDto } from './dto/inventory-adjustment.dto.js';
import type { InventoryTransactionQueryDto } from './dto/inventory-transaction-query.dto.js';
import type { StockInDto } from './dto/stock-in.dto.js';
import type { StockOutDto } from './dto/stock-out.dto.js';
import {
  InventoryAdjustmentDirection,
  INVENTORY_ACTIVITY,
  INVENTORY_ERROR_CODE,
} from './inventory.constant.js';
import type {
  PaginatedInventoryTransactionResponse,
  SafeInventoryItemResponse,
} from './inventory.interface.js';
import {
  buildInventoryItemScopeWhere,
  buildInventoryTransactionScopeWhere,
  getInventoryScopedTeamIds,
} from './inventory-scope.policy.js';
import {
  mapInventoryItemResponse,
  mapInventoryTransactionResponse,
} from './inventory.mapper.js';
import {
  inventoryItemSelect,
  inventoryTransactionSelect,
} from './inventory.select.js';
import { throwInventoryItemNotFound } from './inventory-item.service.js';

@Injectable()
export class InventoryStockService {
  constructor(private readonly prisma: PrismaService) {}

  async stockIn(
    viewer: OperixViewer,
    itemId: string,
    dto: StockInDto,
  ): Promise<SafeInventoryItemResponse> {
    this.assertStockManager(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const item = await this.readScopedQuantityItem(tx, viewer, itemId);
      this.assertItemActive(item.isActive);

      const resultingQuantity = item.quantity + dto.quantity;

      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: resultingQuantity },
        select: inventoryItemSelect,
      });

      await tx.inventoryTransaction.create({
        data: {
          itemId: item.id,
          type: InventoryTransactionType.STOCK_IN,
          quantity: dto.quantity,
          previousQuantity: item.quantity,
          resultingQuantity,
          actorId: viewer.userId,
          note: dto.note ?? null,
        },
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: INVENTORY_ACTIVITY.INVENTORY_STOCK_IN,
        entityType: 'INVENTORY_ITEM',
        entityId: item.id,
        metadata: {
          itemId: item.id,
          teamId: item.teamId,
          quantity: dto.quantity,
          previousQuantity: item.quantity,
          resultingQuantity,
        },
      });

      return mapInventoryItemResponse(updated);
    });
  }

  async stockOut(
    viewer: OperixViewer,
    itemId: string,
    dto: StockOutDto,
  ): Promise<SafeInventoryItemResponse> {
    this.assertStockManager(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const item = await this.readScopedQuantityItem(tx, viewer, itemId);
      this.assertItemActive(item.isActive);

      if (item.isReturnable) {
        throw new AppException(
          HttpStatus.CONFLICT,
          INVENTORY_ERROR_CODE.INVENTORY_RETURNABLE_ITEM_REQUIRES_ASSIGNMENT,
          'Returnable inventory items must use the assignment flow.',
        );
      }

      if (dto.quantity > item.quantity) {
        throwInsufficientStock();
      }

      if (dto.memberId) {
        await this.assertActiveMemberInTeam(tx, dto.memberId, item.teamId);
      }

      const resultingQuantity = item.quantity - dto.quantity;

      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: resultingQuantity },
        select: inventoryItemSelect,
      });

      await tx.inventoryTransaction.create({
        data: {
          itemId: item.id,
          type: InventoryTransactionType.STOCK_OUT,
          quantity: dto.quantity,
          previousQuantity: item.quantity,
          resultingQuantity,
          actorId: viewer.userId,
          memberId: dto.memberId ?? null,
          reason: dto.reason,
          note: dto.note ?? null,
        },
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: INVENTORY_ACTIVITY.INVENTORY_STOCK_OUT,
        entityType: 'INVENTORY_ITEM',
        entityId: item.id,
        metadata: {
          itemId: item.id,
          teamId: item.teamId,
          memberId: dto.memberId ?? null,
          quantity: dto.quantity,
          previousQuantity: item.quantity,
          resultingQuantity,
        },
      });

      return mapInventoryItemResponse(updated);
    });
  }

  async adjust(
    viewer: OperixViewer,
    itemId: string,
    dto: InventoryAdjustmentDto,
  ): Promise<SafeInventoryItemResponse> {
    this.assertStockManager(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const item = await this.readScopedQuantityItem(tx, viewer, itemId);
      this.assertItemActive(item.isActive);

      const isIncrease =
        dto.direction === InventoryAdjustmentDirection.INCREASE;
      if (!isIncrease && dto.quantity > item.quantity) {
        throwInsufficientStock();
      }

      const resultingQuantity = isIncrease
        ? item.quantity + dto.quantity
        : item.quantity - dto.quantity;
      const type = isIncrease
        ? InventoryTransactionType.ADJUSTMENT_IN
        : InventoryTransactionType.ADJUSTMENT_OUT;

      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: resultingQuantity },
        select: inventoryItemSelect,
      });

      await tx.inventoryTransaction.create({
        data: {
          itemId: item.id,
          type,
          quantity: dto.quantity,
          previousQuantity: item.quantity,
          resultingQuantity,
          actorId: viewer.userId,
          reason: dto.reason,
          note: dto.note ?? null,
        },
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: INVENTORY_ACTIVITY.INVENTORY_ADJUSTED,
        entityType: 'INVENTORY_ITEM',
        entityId: item.id,
        metadata: {
          itemId: item.id,
          teamId: item.teamId,
          quantity: dto.quantity,
          previousQuantity: item.quantity,
          resultingQuantity,
          adjustmentType: type,
        },
      });

      return mapInventoryItemResponse(updated);
    });
  }

  async listTransactions(
    viewer: OperixViewer,
    query: InventoryTransactionQueryDto,
  ): Promise<PaginatedInventoryTransactionResponse> {
    this.assertStockManager(viewer);
    const normalized = normalizePagination(query);
    const where = this.buildTransactionWhere(viewer, query);

    const [data, total] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({
        where,
        select: inventoryTransactionSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);

    return {
      data: data.map(mapInventoryTransactionResponse),
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  private buildTransactionWhere(
    viewer: OperixViewer,
    query: InventoryTransactionQueryDto,
  ): Prisma.InventoryTransactionWhereInput {
    const filters: Prisma.InventoryTransactionWhereInput[] = [
      buildInventoryTransactionScopeWhere(viewer),
    ];

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

    if (query.itemId) {
      filters.push({ itemId: query.itemId });
    }

    if (query.type) {
      filters.push({ type: query.type });
    }

    if (query.memberId) {
      filters.push({ memberId: query.memberId });
    }

    if (query.actorId) {
      filters.push({ actorId: query.actorId });
    }

    if (query.from || query.to) {
      filters.push({
        createdAt: {
          gte: query.from,
          lte: query.to,
        },
      });
    }

    return { AND: filters };
  }

  private async readScopedQuantityItem(
    tx: PrismaTransactionClient,
    viewer: OperixViewer,
    itemId: string,
  ) {
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

    return item;
  }

  private assertStockManager(viewer: OperixViewer): void {
    if (
      viewer.role === UserRole.SUPER_ADMIN ||
      viewer.role === UserRole.ADMIN
    ) {
      return;
    }

    throw new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to inventory stock operations.',
    );
  }

  private assertItemActive(isActive: boolean): void {
    if (!isActive) {
      throw new AppException(
        HttpStatus.CONFLICT,
        INVENTORY_ERROR_CODE.INVENTORY_ITEM_INACTIVE,
        'Inactive inventory items cannot be modified.',
      );
    }
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
        'Inventory can only be issued to an active Member.',
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

export function throwInsufficientStock(): never {
  throw new AppException(
    HttpStatus.CONFLICT,
    INVENTORY_ERROR_CODE.INSUFFICIENT_INVENTORY_STOCK,
    'Insufficient inventory stock.',
  );
}
