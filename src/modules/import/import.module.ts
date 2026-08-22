import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { SpreadsheetModule } from '../../shared/spreadsheet/spreadsheet.module.js';
import { ProfileRecognizer } from './analyzers/profile-recognizer.js';
import { ImportController } from './import.controller.js';
import { ImportErrorReportService } from './import-error-report.service.js';
import { ImportService } from './import.service.js';
import { ImportProfileRegistry } from './profiles/import-profile.registry.js';

@Module({
  imports: [PrismaModule, OperixAuthModule, SpreadsheetModule],
  controllers: [ImportController],
  providers: [
    ImportService,
    ImportErrorReportService,
    ProfileRecognizer,
    ImportProfileRegistry,
  ],
})
export class ImportModule {}
