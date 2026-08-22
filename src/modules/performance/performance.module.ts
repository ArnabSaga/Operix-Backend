import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { PerformanceController } from './performance.controller.js';
import { PerformanceService } from './performance.service.js';

@Module({
  imports: [PrismaModule, OperixAuthModule],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
