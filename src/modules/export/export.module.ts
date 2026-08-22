import { Module } from '@nestjs/common';
import { SpreadsheetModule } from '../../shared/spreadsheet/spreadsheet.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { ManagementReportModule } from '../management-report/management-report.module.js';
import { PerformanceModule } from '../performance/performance.module.js';
import { TaskModule } from '../task/task.module.js';
import { ExportController } from './export.controller.js';
import { ExportService } from './export.service.js';

@Module({
  imports: [
    SpreadsheetModule,
    OperixAuthModule,
    TaskModule,
    PerformanceModule,
    DashboardModule,
    ManagementReportModule,
  ],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
