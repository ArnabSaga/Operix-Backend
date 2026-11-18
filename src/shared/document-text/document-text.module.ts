import { Module } from '@nestjs/common';
import { SpreadsheetModule } from '../spreadsheet/spreadsheet.module.js';
import { DocumentTextService } from './document-text.service.js';

@Module({
  imports: [SpreadsheetModule],
  providers: [DocumentTextService],
  exports: [DocumentTextService],
})
export class DocumentTextModule {}
