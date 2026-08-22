import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { ManagementReportController } from './management-report.controller.js';
import { ManagementReportService } from './management-report.service.js';

@Module({
  imports: [PrismaModule, OperixAuthModule],
  controllers: [ManagementReportController],
  providers: [ManagementReportService],
  exports: [ManagementReportService],
})
export class ManagementReportModule {}
