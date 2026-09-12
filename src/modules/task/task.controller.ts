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
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { PublicIdPipe } from '../../shared/identity/public-id.pipe.js';
import { PaginationQueryDto } from '../../shared/pagination/pagination.dto.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { CompleteTaskDto } from './dto/complete-task.dto.js';
import { ListTaskQueryDto } from './dto/list-task-query.dto.js';
import { TaskService } from './task.service.js';
import { TaskDistributionService } from './task-distribution.service.js';
import { RescheduleTaskDistributionDto } from './dto/reschedule-task-distribution.dto.js';
import { UpdateTaskSelfClaimDto } from './dto/update-task-self-claim.dto.js';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly taskDistributionService: TaskDistributionService,
  ) {}

  @Post()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createTask(
    @CurrentViewer() viewer: OperixViewer,
    @Body() dto: CreateTaskDto,
  ) {
    return this.taskService.createTask(viewer, dto);
  }

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  listTasks(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ListTaskQueryDto,
  ) {
    return this.taskService.listTasks(viewer, query);
  }

  @Get(':taskId/history')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  getTaskHistory(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.taskService.getTaskHistory(viewer, taskId, query);
  }

  @Get(':taskId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  getTask(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
  ) {
    return this.taskService.getTask(viewer, taskId);
  }

  @Post(':taskId/assignments')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  assignTask(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
    @Body() dto: AssignTaskDto,
  ) {
    return this.taskService.assignTask(viewer, taskId, dto);
  }

  @Patch(':taskId/self-claim')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  updateSelfClaim(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
    @Body() dto: UpdateTaskSelfClaimDto,
  ) {
    return this.taskService.updateSelfClaim(viewer, taskId, dto.enabled);
  }

  @Post(':taskId/claim')
  @RequireRoles(UserRole.MEMBER)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  claimTask(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
  ) {
    return this.taskService.claimTask(viewer, taskId);
  }

  @Post(':taskId/start')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  startTask(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
  ) {
    return this.taskService.startTask(viewer, taskId);
  }

  @Post(':taskId/complete')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  completeTask(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
    @Body() dto: CompleteTaskDto,
  ) {
    return this.taskService.completeTask(viewer, taskId, dto);
  }

  @Patch(':taskId/distribution')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  rescheduleDistribution(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
    @Body() dto: RescheduleTaskDistributionDto,
  ) {
    return this.taskDistributionService.reschedule(
      viewer,
      taskId,
      dto.scheduledAt,
    );
  }

  @Post(':taskId/distribution/cancel')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  cancelDistribution(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
  ) {
    return this.taskDistributionService.cancel(viewer, taskId);
  }
}
