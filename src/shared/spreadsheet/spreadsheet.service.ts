import { Inject, Injectable } from '@nestjs/common';
import { SPREADSHEET_ADAPTER } from './spreadsheet.constant.js';
import type {
  SpreadsheetAdapter,
  SpreadsheetTextLimits,
  SpreadsheetTextResult,
  SpreadsheetWorkbook,
  SpreadsheetWriteWorkbook,
} from './spreadsheet.interface.js';

@Injectable()
export class SpreadsheetService {
  constructor(
    @Inject(SPREADSHEET_ADAPTER)
    private readonly adapter: SpreadsheetAdapter,
  ) {}

  parse(buffer: Buffer): SpreadsheetWorkbook {
    return this.adapter.parse(buffer);
  }

  /**
   * Reads worksheet text under explicit structural limits. This is the only
   * supported way to turn an uploaded workbook into text for AI analysis.
   */
  readText(
    buffer: Buffer,
    limits: SpreadsheetTextLimits,
  ): SpreadsheetTextResult {
    return this.adapter.readText(buffer, limits);
  }

  write(workbook: SpreadsheetWriteWorkbook): Buffer {
    return this.adapter.write(workbook);
  }
}
