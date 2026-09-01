import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  InventoryTransactionType,
  UserRole,
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
import type { CreateInventoryItemDto } from './dto/create-inventory-item.dto.js';
import type { InventoryItemQueryDto } from './dto/inventory-item-query.dto.js';
import type { UpdateInventoryItemDto } from './dto/update-inventory-item.dto.js';
import {
  INVENTORY_ACTIVITY,
  INVENTORY_ERROR_CODE,
} from './inventory.constant.js';
import type {
  InventorySummaryResponse,
  PaginatedInventoryItemResponse,
  SafeInventoryItemResponse,
} from './inventory.interface.js';
import {
  buildInventoryItemScopeWhere,
  getInventoryScopedTeamIds,
} from './inventory-scope.policy.js';
import { mapInventoryItemResponse } from './inventory.mapper.js';
import { inventoryItemSelect } from './inventory.select.js';

@Injectable()
export class InventoryItemService {
  constructor(private readonly prisma: PrismaService) {}

  async createItem(
    viewer: OperixViewer,
    dto: CreateInventoryItemDto,
  ): Promise<SafeInventoryItemResponse> {
    this.assertItemManager(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const teamId = await this.resolveTeamInScope(tx, viewer, dto.teamId);
      const categoryId = await this.resolveActiveCategory(tx, dto.categoryId);
      await this.assertSkuAvailable(tx, teamId, dto.sku);

      const openingQuantity = dto.openingQuantity ?? 0;

      const item = await tx.inventoryItem.create({
        data: {
          teamId,
          categoryId,
          sku: dto.sku,
          name: dto.name,
          description: dto.description ?? null,
          quantity: openingQuantity,
          lowStockThreshold: dto.lowStockThreshold ?? null,
          isReturnable: dto.isReturnable ?? false,
        },
        select: inventoryItemSelect,
      });

      if (openingQuantity > 0) {
        await tx.inventoryTransaction.create({
          data: {
            itemId: item.id,
            type: InventoryTransactionType.STOCK_IN,
            quantity: openingQuantity,
            previousQuantity: 0,
            resultingQuantity: openingQuantity,
            actorId: viewer.userId,
            reason: 'Opening inventory balance',
          },
        });
      }

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: INVENTORY_ACTIVITY.INVENTORY_CREATED,
        entityType: 'INVENTORY_ITEM',
        entityId: item.id,
        metadata: {
          itemId: item.id,
          teamId: item.team.id,
          quantity: openingQuantity,
        },
      });

      return mapInventoryItemResponse(item);
    });
  }

  async listItems(
    viewer: OperixViewer,
    query: InventoryItemQueryDto,
  ): Promise<PaginatedInventoryItemResponse> {
    this.assertItemManager(viewer);
    const normalized = normalizePagination(query);
    const where = this.buildItemWhere(viewer, query);

    if (query.lowStock !== undefined) {
      const allRows = await this.prisma.inventoryItem.findMany({
        where,
        select: inventoryItemSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      const filtered = allRows
        .map(mapInventoryItemResponse)
        .filter((item) =>
          query.lowStock ? item.isLowStock : !item.isLowStock,
        );
      const pageRows = filtered.slice(
        normalized.skip,
        normalized.skip + normalized.take,
      );

      return {
        data: pageRows,
        meta: createPaginationMeta({
          page: normalized.page,
          limit: normalized.limit,
          total: filtered.length,
        }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        select: inventoryItemSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return {
      data: data.map(mapInventoryItemResponse),
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  async getItem(
    viewer: OperixViewer,
    itemId: string,
  ): Promise<SafeInventoryItemResponse> {
    this.assertItemManager(viewer);
    const item = await this.prisma.inventoryItem.findFirst({
      where: {
        publicId: itemId,
        AND: [buildInventoryItemScopeWhere(viewer)],
      },
      select: inventoryItemSelect,
    });

    if (!item) {
      throwInventoryItemNotFound();
    }

    return mapInventoryItemResponse(item);
  }

  async updateItem(
    viewer: OperixViewer,
    itemId: string,
    dto: UpdateInventoryItemDto,
  ): Promise<SafeInventoryItemResponse> {
    this.assertItemManager(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const existing = await tx.inventoryItem.findFirst({
        where: {
          publicId: itemId,
          AND: [buildInventoryItemScopeWhere(viewer)],
        },
        select: {
          id: true,
          name: true,
          description: true,
          categoryId: true,
          lowStockThreshold: true,
          isReturnable: true,
          isActive: true,
          teamId: true,
        },
      });

      if (!existing) {
        throwInventoryItemNotFound();
      }

      if (dto.categoryId !== undefined && dto.categoryId !== null) {
        dto.categoryId = await this.resolveActiveCategory(tx, dto.categoryId);
      }

      if (existing.isReturnable && dto.isReturnable === false) {
        const outstanding = await tx.inventoryAssignment.count({
          where: {
            itemId: existing.id,
            returnedQuantity: {
              lt: tx.inventoryAssignment.fields.quantity,
            },
          },
        });

        if (outstanding > 0) {
          throw new AppException(
            HttpStatus.CONFLICT,
            INVENTORY_ERROR_CODE.INVENTORY_RETURNABILITY_CHANGE_BLOCKED,
            'Returnability cannot be disabled while assignments are outstanding.',
          );
        }
      }

      const next = {
        name: dto.name ?? existing.name,
        description:
          dto.description === undefined
            ? existing.description
            : dto.description,
        categoryId:
          dto.categoryId === undefined ? existing.categoryId : dto.categoryId,
        lowStockThreshold:
          dto.lowStockThreshold === undefined
            ? existing.lowStockThreshold
            : dto.lowStockThreshold,
        isReturnable: dto.isReturnable ?? existing.isReturnable,
        isActive: dto.isActive ?? existing.isActive,
      };

      if (
        next.name === existing.name &&
        next.description === existing.description &&
        next.categoryId === existing.categoryId &&
        next.lowStockThreshold === existing.lowStockThreshold &&
        next.isReturnable === existing.isReturnable &&
        next.isActive === existing.isActive
      ) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: existing.id },
          select: inventoryItemSelect,
        });

        return mapInventoryItemResponse(item);
      }

      const item = await tx.inventoryItem.update({
        where: { id: existing.id },
        data: next,
        select: inventoryItemSelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: INVENTORY_ACTIVITY.INVENTORY_UPDATED,
        entityType: 'INVENTORY_ITEM',
        entityId: item.id,
        metadata: {
          itemId: item.id,
          teamId: item.team.id,
        },
      });

      return mapInventoryItemResponse(item);
    });
  }

  async getSummary(viewer: OperixViewer): Promise<InventorySummaryResponse> {
    this.assertItemManager(viewer);
    const where = buildInventoryItemScopeWhere(viewer);

    const [
      activeItemCount,
      inactiveItemCount,
      items,
      outstandingAssignmentCount,
    ] = await Promise.all([
      this.prisma.inventoryItem.count({
        where: {
          AND: [where],
          isActive: true,
        },
      }),
      this.prisma.inventoryItem.count({
        where: {
          AND: [where],
          isActive: false,
        },
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          AND: [where],
          isActive: true,
        },
        select: {
          quantity: true,
          lowStockThreshold: true,
        },
      }),
      this.prisma.inventoryAssignment.count({
        where: {
          returnedQuantity: {
            lt: this.prisma.inventoryAssignment.fields.quantity,
          },
          item: where,
        },
      }),
    ]);

    return {
      activeItemCount,
      inactiveItemCount,
      lowStockItemCount: items.filter(
        (item) =>
          item.lowStockThreshold !== null &&
          item.quantity > 0 &&
          item.quantity <= item.lowStockThreshold,
      ).length,
      outOfStockItemCount: items.filter((item) => item.quantity === 0).length,
      outstandingAssignmentCount,
    };
  }

  private buildItemWhere(
    viewer: OperixViewer,
    query: InventoryItemQueryDto,
  ): Prisma.InventoryItemWhereInput {
    const filters: Prisma.InventoryItemWhereInput[] = [
      buildInventoryItemScopeWhere(viewer),
    ];

    if (query.q) {
      filters.push({
        OR: [
          {
            sku: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            name: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    if (query.categoryId) {
      filters.push({ category: { publicId: query.categoryId } });
    }

    if (query.teamId) {
      filters.push({ team: { publicId: query.teamId } });
    }

    if (query.isActive !== undefined) {
      filters.push({ isActive: query.isActive });
    }

    if (query.isReturnable !== undefined) {
      filters.push({ isReturnable: query.isReturnable });
    }

    return {
      AND: filters,
    };
  }

  private assertItemManager(viewer: OperixViewer): void {
    if (
      viewer.role === UserRole.SUPER_ADMIN ||
      viewer.role === UserRole.ADMIN
    ) {
      return;
    }

    throw new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to inventory items.',
    );
  }

  private async resolveTeamInScope(
    tx: PrismaTransactionClient,
    viewer: OperixViewer,
    teamId: string,
  ): Promise<string> {
    const team = await tx.team.findUnique({
      where: { publicId: teamId },
      select: { id: true },
    });

    if (!team) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        APP_ERROR_CODE.RESOURCE_NOT_FOUND,
        'Team was not found.',
      );
    }

    if (
      viewer.role === UserRole.ADMIN &&
      !getInventoryScopedTeamIds(viewer).includes(team.id)
    ) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to this Team inventory.',
      );
    }
    return team.id;
  }

  private async resolveActiveCategory(
    tx: PrismaTransactionClient,
    categoryId?: string | null,
  ): Promise<string | null> {
    if (!categoryId) {
      return null;
    }

    const category = await tx.inventoryCategory.findUnique({
      where: { publicId: categoryId },
      select: { id: true, isActive: true },
    });

    if (!category) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        INVENTORY_ERROR_CODE.INVENTORY_CATEGORY_NOT_FOUND,
        'Inventory category was not found.',
      );
    }

    if (!category.isActive) {
      throw new AppException(
        HttpStatus.CONFLICT,
        INVENTORY_ERROR_CODE.INVENTORY_CATEGORY_INACTIVE,
        'Inactive inventory categories cannot be selected.',
      );
    }
    return category.id;
  }

  private async assertSkuAvailable(
    tx: PrismaTransactionClient,
    teamId: string,
    sku: string,
  ): Promise<void> {
    const existing = await tx.inventoryItem.findUnique({
      where: {
        teamId_sku: {
          teamId,
          sku,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        INVENTORY_ERROR_CODE.INVENTORY_SKU_ALREADY_EXISTS,
        'Inventory SKU already exists for this Team.',
      );
    }
  }
}

export function throwInventoryItemNotFound(): never {
  throw new AppException(
    HttpStatus.NOT_FOUND,
    INVENTORY_ERROR_CODE.INVENTORY_ITEM_NOT_FOUND,
    'Inventory item was not found.',
  );
}
