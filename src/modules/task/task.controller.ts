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
import { PublicIdPipe } from '../../shared/identity/public-id.pipe.js';
import { PaginationQueryDto } from '../../shared/pagination/pagination.dto.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { ListTaskQueryDto } from './dto/list-task-query.dto.js';
import { TaskService } from './task.service.js';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @RequireRoles(UserRole.ADMIN)
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
  @RequireRoles(UserRole.ADMIN)
  assignTask(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
    @Body() dto: AssignTaskDto,
  ) {
    return this.taskService.assignTask(viewer, taskId, dto);
  }

  @Post(':taskId/start')
  @RequireRoles(UserRole.MEMBER)
  startTask(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
  ) {
    return this.taskService.startTask(viewer, taskId);
  }
}
