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
import { AssistantService } from './assistant.service.js';
import { AskOperixDto } from './dto/ask-operix.dto.js';

@ApiTags('assistant')
@Controller('assistant')
@UseGuards(
  ViewerContextGuard,
  AccountStatusGuard,
  OperixRoleGuard,
  OperixUserThrottlerGuard,
)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('ask')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  ask(@CurrentViewer() viewer: OperixViewer, @Body() dto: AskOperixDto) {
    return this.assistantService.ask(viewer, dto.question);
  }
}
