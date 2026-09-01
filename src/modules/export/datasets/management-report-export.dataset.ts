import {
  dateCell,
  numberCell,
  textCell,
} from '../../../shared/spreadsheet/spreadsheet-write.helper.js';
import type { SafeManagementReportResponse } from '../../management-report/management-report.interface.js';
import { EXPORT_SCHEMA_VERSION } from '../export.constant.js';
import type {
  ExportMetadataInput,
  ExportWorkbook,
} from '../export.interface.js';
import { headerRow, metadataSheet, row } from '../export-workbook.helper.js';

export function buildManagementReportExportWorkbook(
  reports: SafeManagementReportResponse[],
  metadata: Omit<ExportMetadataInput, 'dataset' | 'schemaVersion'>,
): ExportWorkbook {
  return {
    sheets: [
      {
        name: 'Management Reports',
        rows: [
          headerRow(
            'Report ID',
            'Admin ID',
            'Team ID',
            'Title',
            'Period Start',
            'Period End',
            'Operational Summary',
            'Completed Work Summary',
            'Pending Work Summary',
            'Overdue Work Summary',
            'Performance Summary',
            'Key Issues',
            'Actions Taken',
            'Next Period Plan',
            'Remarks',
            'Status',
            'Latest Version',
            'Latest Version Submitted At',
            'Latest Review Action',
            'Latest Review Feedback',
            'Latest Reviewer ID',
            'Latest Reviewed At',
            'Submitted At',
            'Approved At',
            'Created At',
            'Updated At',
          ),
          ...reports.map((report) =>
            row(
              textCell(report.id),
              textCell(report.adminId),
              textCell(report.teamId),
              textCell(report.title),
              dateCell(report.periodStart),
              dateCell(report.periodEnd),
              textCell(report.operationalSummary),
              textCell(report.completedWorkSummary),
              textCell(report.pendingWorkSummary),
              textCell(report.overdueWorkSummary),
              textCell(report.performanceSummary),
              textCell(report.keyIssues),
              textCell(report.actionsTaken),
              textCell(report.nextPeriodPlan),
              textCell(report.remarks),
              textCell(report.status),
              numberCell(report.latestSubmittedVersion?.version),
              dateCell(report.latestSubmittedVersion?.submittedAt),
              textCell(report.latestReview?.action),
              textCell(report.latestReview?.feedback),
              textCell(report.latestReview?.reviewer.id),
              dateCell(report.latestReview?.reviewedAt),
              dateCell(report.submittedAt),
              dateCell(report.approvedAt),
              dateCell(report.createdAt),
              dateCell(report.updatedAt),
            ),
          ),
        ],
      },
      metadataSheet({
        ...metadata,
        dataset: 'MANAGEMENT_REPORTS',
        schemaVersion: EXPORT_SCHEMA_VERSION.MANAGEMENT_REPORTS,
      }),
    ],
  };
}
