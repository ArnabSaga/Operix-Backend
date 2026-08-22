import { HttpStatus, Injectable } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import type { PaginationQueryDto } from '../../shared/pagination/pagination.dto.js';
import type {
  PaginatedInventoryCategoryResponse,
  SafeInventoryCategoryResponse,
} from './inventory.interface.js';
import {
  INVENTORY_ACTIVITY,
  INVENTORY_ERROR_CODE,
} from './inventory.constant.js';
import { inventoryCategorySelect } from './inventory.select.js';
import { mapInventoryCategoryResponse } from './inventory.mapper.js';
import type { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto.js';
import type { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto.js';

@Injectable()
export class InventoryCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async createCategory(
    viewer: OperixViewer,
    dto: CreateInventoryCategoryDto,
  ): Promise<SafeInventoryCategoryResponse> {
    this.assertSuperAdmin(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      await this.assertCategoryNameAvailable(dto.name);

      const category = await tx.inventoryCategory.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
        },
        select: inventoryCategorySelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: INVENTORY_ACTIVITY.INVENTORY_CATEGORY_CREATED,
        entityType: 'INVENTORY_CATEGORY',
        entityId: category.id,
        metadata: {
          categoryId: category.id,
        },
      });

      return mapInventoryCategoryResponse(category);
    });
  }

  async listCategories(
    viewer: OperixViewer,
    query: PaginationQueryDto,
  ): Promise<PaginatedInventoryCategoryResponse> {
    this.assertCategoryReader(viewer);
    const normalized = normalizePagination(query);

    const [data, total] = await Promise.all([
      this.prisma.inventoryCategory.findMany({
        select: inventoryCategorySelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.inventoryCategory.count(),
    ]);

    return {
      data: data.map(mapInventoryCategoryResponse),
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  async getCategory(
    viewer: OperixViewer,
    categoryId: string,
  ): Promise<SafeInventoryCategoryResponse> {
    this.assertCategoryReader(viewer);

    const category = await this.prisma.inventoryCategory.findUnique({
      where: { id: categoryId },
      select: inventoryCategorySelect,
    });

    if (!category) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        INVENTORY_ERROR_CODE.INVENTORY_CATEGORY_NOT_FOUND,
        'Inventory category was not found.',
      );
    }

    return mapInventoryCategoryResponse(category);
  }

  async updateCategory(
    viewer: OperixViewer,
    categoryId: string,
    dto: UpdateInventoryCategoryDto,
  ): Promise<SafeInventoryCategoryResponse> {
    this.assertSuperAdmin(viewer);

    return runSerializableTransaction(this.prisma, async (tx) => {
      const existing = await tx.inventoryCategory.findUnique({
        where: { id: categoryId },
        select: inventoryCategorySelect,
      });

      if (!existing) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          INVENTORY_ERROR_CODE.INVENTORY_CATEGORY_NOT_FOUND,
          'Inventory category was not found.',
        );
      }

      if (dto.name !== undefined && dto.name !== existing.name) {
        await this.assertCategoryNameAvailable(dto.name, existing.id);
      }

      const next = {
        name: dto.name ?? existing.name,
        description:
          dto.description === undefined
            ? existing.description
            : dto.description,
        isActive: dto.isActive ?? existing.isActive,
      };

      if (
        next.name === existing.name &&
        next.description === existing.description &&
        next.isActive === existing.isActive
      ) {
        return mapInventoryCategoryResponse(existing);
      }

      const category = await tx.inventoryCategory.update({
        where: { id: existing.id },
        data: next,
        select: inventoryCategorySelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: INVENTORY_ACTIVITY.INVENTORY_CATEGORY_UPDATED,
        entityType: 'INVENTORY_CATEGORY',
        entityId: category.id,
        metadata: {
          categoryId: category.id,
        },
      });

      return mapInventoryCategoryResponse(category);
    });
  }

  private assertCategoryReader(viewer: OperixViewer): void {
    if (
      viewer.role === UserRole.SUPER_ADMIN ||
      viewer.role === UserRole.ADMIN
    ) {
      return;
    }

    throw new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to inventory categories.',
    );
  }

  private assertSuperAdmin(viewer: OperixViewer): void {
    if (viewer.role !== UserRole.SUPER_ADMIN) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'Only Super Admin can manage inventory categories.',
      );
    }
  }

  private async assertCategoryNameAvailable(
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.prisma.inventoryCategory.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        id: exceptId
          ? {
              not: exceptId,
            }
          : undefined,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        APP_ERROR_CODE.CONFLICT,
        'Inventory category name already exists.',
      );
    }
  }
}
