import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { ActivityService } from './activity.service.js';
import { ListActivityQueryDto } from './dto/list-activity-query.dto.js';

@ApiTags('activities')
@Controller('activities')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  listActivities(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ListActivityQueryDto,
  ) {
    return this.activityService.listActivities(viewer, query);
  }
}
