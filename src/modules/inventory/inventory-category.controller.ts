import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { PaginationQueryDto } from '../../shared/pagination/pagination.dto.js';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto.js';
import { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto.js';
import { InventoryCategoryService } from './inventory-category.service.js';

@ApiTags('inventory')
@Controller('inventory/categories')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class InventoryCategoryController {
  constructor(private readonly categoryService: InventoryCategoryService) {}

  @Post()
  @RequireRoles(UserRole.SUPER_ADMIN)
  createCategory(
    @CurrentViewer() viewer: OperixViewer,
    @Body() dto: CreateInventoryCategoryDto,
  ) {
    return this.categoryService.createCategory(viewer, dto);
  }

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listCategories(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: PaginationQueryDto,
  ) {
    return this.categoryService.listCategories(viewer, query);
  }

  @Get(':categoryId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getCategory(
    @CurrentViewer() viewer: OperixViewer,
    @Param('categoryId') categoryId: string,
  ) {
    return this.categoryService.getCategory(viewer, categoryId);
  }

  @Patch(':categoryId')
  @RequireRoles(UserRole.SUPER_ADMIN)
  updateCategory(
    @CurrentViewer() viewer: OperixViewer,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateInventoryCategoryDto,
  ) {
    return this.categoryService.updateCategory(viewer, categoryId, dto);
  }
}
