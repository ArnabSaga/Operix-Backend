import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';

@Module({
  imports: [PrismaModule, OperixAuthModule],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
