import { Injectable } from '@nestjs/common';
import { toSafeSpreadsheetText } from '../../shared/spreadsheet/spreadsheet-formula.guard.js';
import { SpreadsheetService } from '../../shared/spreadsheet/spreadsheet.service.js';
import type {
  SpreadsheetWriteRow,
  SpreadsheetWriteWorkbook,
} from '../../shared/spreadsheet/spreadsheet.interface.js';
import type {
  ImportPreviewIssue,
  ImportPreviewResult,
} from './import.interface.js';

@Injectable()
export class ImportErrorReportService {
  constructor(private readonly spreadsheetService: SpreadsheetService) {}

  buildReport(preview: ImportPreviewResult): Buffer {
    const workbook: SpreadsheetWriteWorkbook = {
      sheets: [
        {
          name: 'Summary',
          rows: buildSummaryRows(preview),
        },
        {
          name: 'Errors',
          rows: buildIssueRows(
            preview.allIssues.filter((issue) => issue.severity === 'ERROR'),
          ),
        },
        {
          name: 'Warnings',
          rows: buildIssueRows(
            preview.allIssues.filter((issue) => issue.severity === 'WARNING'),
          ),
        },
      ],
    };

    return this.spreadsheetService.write(workbook);
  }
}

function buildSummaryRows(preview: ImportPreviewResult): SpreadsheetWriteRow[] {
  return [
    cells('Import Type', preview.importType),
    cells('Mapping Profile', preview.mappingProfile),
    cells('Original Filename', preview.source.originalName),
    cells('Generated At', new Date().toISOString()),
    cells('Source Rows', preview.summary.sourceRowCount),
    cells('Considered Rows', preview.summary.consideredRows),
    cells('Ignored Rows', preview.summary.ignoredRows),
    cells('Candidate Rows', preview.summary.candidateRows),
    cells('Candidate Update Rows', preview.summary.candidateUpdateRows),
    cells('Already Present Rows', preview.summary.alreadyPresentRows),
    cells('Invalid Rows', preview.summary.invalidRows),
    cells('Conflict Rows', preview.summary.conflictRows),
    cells('Warning Count', preview.summary.warningCount),
    cells('Issue Count', preview.summary.issueCount),
    cells('Can Import', preview.canImport),
  ];
}

function buildIssueRows(issues: ImportPreviewIssue[]): SpreadsheetWriteRow[] {
  return [
    cells(
      'Sheet',
      'Row',
      'Column',
      'Address',
      'Field',
      'Source Value',
      'Normalized Value',
      'Code',
      'Message',
    ),
    ...issues.map((issue) =>
      cells(
        issue.sheet,
        issue.row,
        issue.column ?? '',
        issue.address ?? '',
        issue.field,
        issue.sourceValue ?? '',
        issue.normalizedValue ?? '',
        issue.code,
        issue.message,
      ),
    ),
  ];
}

function cells(...values: unknown[]): SpreadsheetWriteRow {
  return values.map((value) => ({
    value: toSafeSpreadsheetText(value),
  }));
}
