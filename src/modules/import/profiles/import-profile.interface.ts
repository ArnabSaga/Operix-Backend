import type { PrismaService } from '../../../database/prisma.service.js';
import type { SpreadsheetWorkbook } from '../../../shared/spreadsheet/spreadsheet.interface.js';
import type {
  ImportPreviewIssue,
  ImportProfileId,
  ImportRowResult,
  ImportType,
} from '../import.interface.js';

export type HeaderOrder = 'STRICT' | 'ANY_ORDER';

export interface ImportProfileRecognition {
  matches: boolean;
  structureIssues: ImportPreviewIssue[];
}

export interface ImportProfileContext {
  prisma: PrismaService;
}

export interface ImportProfile {
  id: ImportProfileId;
  importType: ImportType;
  selectedSheetName: string;
  headerRow: number;
  headerOrder: HeaderOrder;
  requiredHeaders: string[];
  optionalHeaders: string[];
  importOwnedFields: string[];
  recognize(workbook: SpreadsheetWorkbook): ImportProfileRecognition;
  preview(
    workbook: SpreadsheetWorkbook,
    context: ImportProfileContext,
  ): Promise<ImportRowResult[]>;
}
