import type { Prisma } from '../../../generated/prisma/client.js';
import { managementReportSelect } from './management-report.select.js';
import type { SafeManagementReportResponse } from './management-report.interface.js';

type ManagementReportRecord = Prisma.ManagementReportGetPayload<{
  select: typeof managementReportSelect;
}>;

export function mapManagementReportResponse(
  report: ManagementReportRecord,
): SafeManagementReportResponse {
  const [latestSubmittedVersion] = report.versions;

  return {
    id: report.id,
    adminId: report.adminId,
    teamId: report.teamId,
    title: report.title,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    operationalSummary: report.operationalSummary,
    completedWorkSummary: report.completedWorkSummary,
    pendingWorkSummary: report.pendingWorkSummary,
    overdueWorkSummary: report.overdueWorkSummary,
    performanceSummary: report.performanceSummary,
    keyIssues: report.keyIssues,
    actionsTaken: report.actionsTaken,
    nextPeriodPlan: report.nextPeriodPlan,
    remarks: report.remarks,
    status: report.status,
    submittedAt: report.submittedAt,
    approvedAt: report.approvedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    latestSubmittedVersion: latestSubmittedVersion
      ? {
          id: latestSubmittedVersion.id,
          reportId: latestSubmittedVersion.reportId,
          version: latestSubmittedVersion.version,
          submittedAt: latestSubmittedVersion.submittedAt,
          createdAt: latestSubmittedVersion.createdAt,
        }
      : null,
    latestReview: latestSubmittedVersion?.review ?? null,
  };
}
