import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [PrismaModule, OperixAuthModule, ActivityModule, NotificationModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
