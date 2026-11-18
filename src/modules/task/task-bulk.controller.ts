import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { CreateBulkTaskDto } from './dto/create-bulk-task.dto.js';
import { TaskBulkService } from './task-bulk.service.js';

@ApiTags('tasks')
@Controller('tasks/bulk')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class TaskBulkController {
  constructor(private readonly taskBulkService: TaskBulkService) {}

  @Post()
  @RequireRoles(UserRole.SUPER_ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createBulkTask(
    @CurrentViewer() viewer: OperixViewer,
    @Body() dto: CreateBulkTaskDto,
  ) {
    return this.taskBulkService.createBulkTask(viewer, dto);
  }
}
