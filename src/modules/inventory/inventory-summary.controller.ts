import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { InventoryItemService } from './inventory-item.service.js';

@ApiTags('inventory')
@Controller('inventory/summary')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class InventorySummaryController {
  constructor(private readonly itemService: InventoryItemService) {}

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getSummary(@CurrentViewer() viewer: OperixViewer) {
    return this.itemService.getSummary(viewer);
  }
}
