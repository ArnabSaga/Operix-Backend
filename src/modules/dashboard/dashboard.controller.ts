import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardTrendQueryDto } from './dto/dashboard-trend-query.dto.js';
import { DashboardWorkloadQueryDto } from './dto/dashboard-workload-query.dto.js';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  getOverview(@CurrentViewer() viewer: OperixViewer) {
    return this.dashboardService.getOverview(viewer);
  }

  @Get('workload')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  getWorkload(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: DashboardWorkloadQueryDto,
  ) {
    return this.dashboardService.getWorkload(viewer, query);
  }

  @Get('trends')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  getTrends(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: DashboardTrendQueryDto,
  ) {
    return this.dashboardService.getTrends(viewer, query);
  }
}
