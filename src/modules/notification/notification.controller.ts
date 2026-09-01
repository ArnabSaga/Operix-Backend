import {
  Controller,
  Get,
  Param,
  Patch,
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
import { ListNotificationQueryDto } from './dto/list-notification-query.dto.js';
import { NotificationService } from './notification.service.js';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  listNotifications(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ListNotificationQueryDto,
  ) {
    return this.notificationService.listNotifications(viewer, query);
  }

  @Get('unread-count')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  getUnreadCount(@CurrentViewer() viewer: OperixViewer) {
    return this.notificationService.getUnreadCount(viewer);
  }

  @Patch('read-all')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  markAllRead(@CurrentViewer() viewer: OperixViewer) {
    return this.notificationService.markAllRead(viewer);
  }

  @Patch(':notificationId/read')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  markNotificationRead(
    @CurrentViewer() viewer: OperixViewer,
    @Param('notificationId', PublicIdPipe) notificationId: string,
  ) {
    return this.notificationService.markNotificationRead(
      viewer,
      notificationId,
    );
  }
}
