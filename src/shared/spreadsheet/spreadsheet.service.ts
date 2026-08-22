import { Inject, Injectable } from '@nestjs/common';
import { SPREADSHEET_ADAPTER } from './spreadsheet.constant.js';
import type {
  SpreadsheetAdapter,
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

  write(workbook: SpreadsheetWriteWorkbook): Buffer {
    return this.adapter.write(workbook);
  }
}
