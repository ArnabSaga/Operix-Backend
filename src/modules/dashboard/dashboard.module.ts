import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AiModule } from '../../shared/ai/ai.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardAiController } from './dashboard-ai.controller.js';
import { DashboardAiService } from './dashboard-ai.service.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [
    PrismaModule,
    OperixAuthModule,
    ActivityModule,
    NotificationModule,
    AiModule,
  ],
  controllers: [DashboardController, DashboardAiController],
  providers: [DashboardService, DashboardAiService],
  exports: [DashboardService],
})
export class DashboardModule {}
