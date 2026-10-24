import { Controller, Post, Query, UseGuards } from '@nestjs/common';
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
import { DashboardAiService } from './dashboard-ai.service.js';
import { DashboardTrendDays } from './dashboard.constant.js';
import { DashboardAiQueryDto } from './dto/dashboard-ai-query.dto.js';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(
  ViewerContextGuard,
  AccountStatusGuard,
  OperixRoleGuard,
  OperixUserThrottlerGuard,
)
export class DashboardAiController {
  constructor(private readonly dashboardAiService: DashboardAiService) {}

  @Post('ai-brief')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  generate(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: DashboardAiQueryDto,
  ) {
    return this.dashboardAiService.generate(
      viewer,
      query.days ?? DashboardTrendDays.SEVEN,
    );
  }
}
