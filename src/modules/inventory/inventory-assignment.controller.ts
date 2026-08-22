import {
  Body,
  Controller,
  Get,
  Param,
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
import { InventoryAssignmentQueryDto } from './dto/inventory-assignment-query.dto.js';
import { ReturnInventoryDto } from './dto/return-inventory.dto.js';
import { InventoryAssignmentService } from './inventory-assignment.service.js';

@ApiTags('inventory')
@Controller('inventory/assignments')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class InventoryAssignmentController {
  constructor(private readonly assignmentService: InventoryAssignmentService) {}

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  listAssignments(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: InventoryAssignmentQueryDto,
  ) {
    return this.assignmentService.listAssignments(viewer, query);
  }

  @Get(':assignmentId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  getAssignment(
    @CurrentViewer() viewer: OperixViewer,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.assignmentService.getAssignment(viewer, assignmentId);
  }

  @Post(':assignmentId/returns')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  returnInventory(
    @CurrentViewer() viewer: OperixViewer,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: ReturnInventoryDto,
  ) {
    return this.assignmentService.returnInventory(viewer, assignmentId, dto);
  }
}
