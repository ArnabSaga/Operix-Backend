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
import { OperixUserThrottlerGuard } from '../../shared/rate-limit/operix-user-throttler.guard.js';
import { GenerateTaskAiDraftDto } from './dto/generate-task-ai-draft.dto.js';
import { TaskAiService } from './task-ai.service.js';

@ApiTags('tasks')
@Controller('tasks/ai')
@UseGuards(
  ViewerContextGuard,
  AccountStatusGuard,
  OperixRoleGuard,
  OperixUserThrottlerGuard,
)
export class TaskAiController {
  constructor(private readonly taskAiService: TaskAiService) {}

  @Post('draft')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  draft(
    @CurrentViewer() viewer: OperixViewer,
    @Body() dto: GenerateTaskAiDraftDto,
  ) {
    return this.taskAiService.draft(viewer, dto);
  }
}
