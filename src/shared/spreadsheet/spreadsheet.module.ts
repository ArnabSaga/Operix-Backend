import { Module } from '@nestjs/common';
import { SheetJsSpreadsheetAdapter } from './adapters/sheetjs-spreadsheet.adapter.js';
import { SPREADSHEET_ADAPTER } from './spreadsheet.constant.js';
import { SpreadsheetService } from './spreadsheet.service.js';

@Module({
  providers: [
    SpreadsheetService,
    {
      provide: SPREADSHEET_ADAPTER,
      useClass: SheetJsSpreadsheetAdapter,
    },
  ],
  exports: [SpreadsheetService],
})
export class SpreadsheetModule {}
