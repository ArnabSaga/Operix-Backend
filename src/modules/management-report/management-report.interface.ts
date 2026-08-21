import type {
  ManagementReport,
  ManagementReportReview,
  ManagementReportVersion,
} from '../../../generated/prisma/client.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';

export type SafeManagementReportVersionSummary = Pick<
  ManagementReportVersion,
  'id' | 'reportId' | 'version' | 'submittedAt' | 'createdAt'
>;

export type SafeManagementReportReviewSummary = Pick<
  ManagementReportReview,
  | 'id'
  | 'reportVersionId'
  | 'reviewerId'
  | 'action'
  | 'feedback'
  | 'reviewedAt'
  | 'createdAt'
>;

export type SafeManagementReportResponse = Pick<
  ManagementReport,
  | 'id'
  | 'adminId'
  | 'teamId'
  | 'title'
  | 'periodStart'
  | 'periodEnd'
  | 'operationalSummary'
  | 'completedWorkSummary'
  | 'pendingWorkSummary'
  | 'overdueWorkSummary'
  | 'performanceSummary'
  | 'keyIssues'
  | 'actionsTaken'
  | 'nextPeriodPlan'
  | 'remarks'
  | 'status'
  | 'submittedAt'
  | 'approvedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  latestSubmittedVersion: SafeManagementReportVersionSummary | null;
  latestReview: SafeManagementReportReviewSummary | null;
};

export interface PaginatedManagementReportResponse {
  data: SafeManagementReportResponse[];
  meta: PaginationMeta;
}
