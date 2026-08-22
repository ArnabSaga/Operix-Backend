import type { UserRole } from '../../../generated/prisma/enums.js';
import type { SpreadsheetWriteWorkbook } from '../../shared/spreadsheet/spreadsheet.interface.js';

export interface ExportFileResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export interface ExportMetadataInput {
  dataset: string;
  schemaVersion: string;
  generatedAt: Date;
  asOf: Date;
  viewerRole: UserRole;
  viewerId: string;
  effectiveScope: string;
  effectiveFilters: Record<string, string | number | boolean | null>;
  extra?: Record<string, string | number | boolean | null>;
}

export type ExportWorkbook = SpreadsheetWriteWorkbook;
