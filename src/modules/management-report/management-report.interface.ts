import type {
  ManagementReportStatus,
  ManagementReportReviewAction,
} from '../../../generated/prisma/enums.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';

export interface SafeManagementReportVersionSummary {
  version: number;
  submittedAt: Date;
  createdAt: Date;
}

export interface SafeManagementReportReviewSummary {
  reviewer: { id: string };
  action: ManagementReportReviewAction;
  feedback: string | null;
  reviewedAt: Date;
  createdAt: Date;
}

export interface SafeManagementReportResponse {
  id: string;
  adminId: string;
  teamId: string;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  operationalSummary: string | null;
  completedWorkSummary: string | null;
  pendingWorkSummary: string | null;
  overdueWorkSummary: string | null;
  performanceSummary: string | null;
  keyIssues: string | null;
  actionsTaken: string | null;
  nextPeriodPlan: string | null;
  remarks: string | null;
  status: ManagementReportStatus;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  latestSubmittedVersion: SafeManagementReportVersionSummary | null;
  latestReview: SafeManagementReportReviewSummary | null;
}

export interface PaginatedManagementReportResponse {
  data: SafeManagementReportResponse[];
  meta: PaginationMeta;
}
