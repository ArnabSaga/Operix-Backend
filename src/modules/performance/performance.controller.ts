import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { PublicIdPipe } from '../../shared/identity/public-id.pipe.js';
import { ListMemberPerformanceQueryDto } from './dto/list-member-performance-query.dto.js';
import { PerformanceService } from './performance.service.js';

@ApiTags('performance')
@Controller('performance')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @Get('members')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listMemberPerformance(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ListMemberPerformanceQueryDto,
  ) {
    return this.performanceService.listMemberPerformance(viewer, query);
  }

  @Get('members/:memberId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  getMemberPerformance(
    @CurrentViewer() viewer: OperixViewer,
    @Param('memberId', PublicIdPipe) memberId: string,
  ) {
    return this.performanceService.getMemberPerformance(viewer, memberId);
  }

  @Get('teams/:teamId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getTeamPerformance(
    @CurrentViewer() viewer: OperixViewer,
    @Param('teamId', PublicIdPipe) teamId: string,
  ) {
    return this.performanceService.getTeamPerformance(viewer, teamId);
  }
}
