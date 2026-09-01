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
import { PublicIdPipe } from '../../shared/identity/public-id.pipe.js';
import { AssignInventoryDto } from './dto/assign-inventory.dto.js';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto.js';
import { InventoryItemQueryDto } from './dto/inventory-item-query.dto.js';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto.js';
import { InventoryAssignmentService } from './inventory-assignment.service.js';
import { InventoryItemService } from './inventory-item.service.js';

@ApiTags('inventory')
@Controller('inventory/items')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class InventoryItemController {
  constructor(
    private readonly itemService: InventoryItemService,
    private readonly assignmentService: InventoryAssignmentService,
  ) {}

  @Post()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createItem(
    @CurrentViewer() viewer: OperixViewer,
    @Body() dto: CreateInventoryItemDto,
  ) {
    return this.itemService.createItem(viewer, dto);
  }

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listItems(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: InventoryItemQueryDto,
  ) {
    return this.itemService.listItems(viewer, query);
  }

  @Get(':itemId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getItem(
    @CurrentViewer() viewer: OperixViewer,
    @Param('itemId', PublicIdPipe) itemId: string,
  ) {
    return this.itemService.getItem(viewer, itemId);
  }

  @Patch(':itemId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateItem(
    @CurrentViewer() viewer: OperixViewer,
    @Param('itemId', PublicIdPipe) itemId: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.itemService.updateItem(viewer, itemId, dto);
  }

  @Post(':itemId/assignments')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  assign(
    @CurrentViewer() viewer: OperixViewer,
    @Param('itemId', PublicIdPipe) itemId: string,
    @Body() dto: AssignInventoryDto,
  ) {
    return this.assignmentService.assign(viewer, itemId, dto);
  }
}
