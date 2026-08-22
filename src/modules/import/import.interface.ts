import type {
  IMPORT_DISPOSITION,
  IMPORT_PROFILE_ID,
  IMPORT_SEVERITY,
  IMPORT_TYPE,
} from './import.constant.js';

export type ImportType = (typeof IMPORT_TYPE)[keyof typeof IMPORT_TYPE];
export type ImportProfileId =
  (typeof IMPORT_PROFILE_ID)[keyof typeof IMPORT_PROFILE_ID];
export type ImportSeverity =
  (typeof IMPORT_SEVERITY)[keyof typeof IMPORT_SEVERITY];
export type ImportRowDisposition =
  (typeof IMPORT_DISPOSITION)[keyof typeof IMPORT_DISPOSITION];

export interface ImportPreviewIssue {
  severity: ImportSeverity;
  sheet: string;
  row: number;
  column?: number;
  address?: string;
  field: string;
  sourceValue: string | null;
  normalizedValue: string | null;
  code: string;
  message: string;
}

export interface ImportPreviewSummary {
  sourceRowCount: number;
  consideredRows: number;
  ignoredRows: number;
  candidateRows: number;
  candidateUpdateRows: number;
  alreadyPresentRows: number;
  invalidRows: number;
  conflictRows: number;
  warningCount: number;
  issueCount: number;
}

export interface ImportPreviewSource {
  originalName: string;
  selectedSheet: string;
  sheetNames: string[];
  totalSourceRows: number;
}

export interface ImportPreviewResponse {
  importType: ImportType;
  mappingProfile: ImportProfileId;
  source: ImportPreviewSource;
  summary: ImportPreviewSummary;
  canImport: boolean;
  issuesTruncated: boolean;
  issues: ImportPreviewIssue[];
}

export interface ImportPreviewResult extends ImportPreviewResponse {
  allIssues: ImportPreviewIssue[];
}

export interface ImportAnalyzedRow<
  TCanonical = unknown,
  TResolved = unknown,
  TBaseline = unknown,
> {
  sourceRow?: number;
  disposition: ImportRowDisposition;
  canonical?: TCanonical | null;
  resolved?: TResolved | null;
  baseline?: TBaseline | null;
  issues: ImportPreviewIssue[];
}

export type ImportRowResult = ImportAnalyzedRow;

export interface HistoricalTaskImportResponse {
  importType: ImportType;
  mappingProfile: ImportProfileId;
  summary: {
    sourceRowCount: number;
    consideredRows: number;
    ignoredRows: number;
    importedRows: number;
    alreadyPresentRows: number;
  };
  verification: {
    tasksCreated: number;
    assignmentsCreated: number;
    historyRowsCreated: number;
  };
}
