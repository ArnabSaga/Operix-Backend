import { Controller, Param, Post, UseGuards } from '@nestjs/common';
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
import { OperixUserThrottlerGuard } from '../../shared/rate-limit/operix-user-throttler.guard.js';
import { TaskAssignmentAiService } from './task-assignment-ai.service.js';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(
  ViewerContextGuard,
  AccountStatusGuard,
  OperixRoleGuard,
  OperixUserThrottlerGuard,
)
export class TaskAssignmentAiController {
  constructor(
    private readonly taskAssignmentAiService: TaskAssignmentAiService,
  ) {}

  @Post(':taskId/ai-assignment-recommendations')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  generate(
    @CurrentViewer() viewer: OperixViewer,
    @Param('taskId', PublicIdPipe) taskId: string,
  ) {
    return this.taskAssignmentAiService.generate(viewer, taskId);
  }
}
