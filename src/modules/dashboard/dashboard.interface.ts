import type {
  ManagementReportStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import type { SafeActivityResponse } from '../activity/activity.interface.js';
import type { SafeNotificationResponse } from '../notification/notification.interface.js';
import type {
  PerformanceMetrics,
  PriorityCounts,
  StatusCounts,
  WorkloadMetrics,
} from '../performance/performance.interface.js';

export interface DashboardContext {
  role: UserRole;
  asOf: Date;
}

export interface DashboardResponseBase {
  role: UserRole;
  context: DashboardContext;
}

export type ReportStatusCounts = Record<ManagementReportStatus, number>;

export interface SuperAdminDashboardOverview extends DashboardResponseBase {
  kpis: {
    totalAdmins: number;
    totalMembers: number;
    totalTasks: number;
    activeTasks: number;
    completedTasks: number;
    cancelledTasks: number;
    overdueTasks: number;
    taskReviewQueue: number;
    revisionRequiredTasks: number;
    pendingManagementReports: number;
    revisionRequiredManagementReports: number;
    completionRate: number | null;
  };
  taskStatusCounts: StatusCounts;
  managementReportStatusCounts: ReportStatusCounts;
  recentActivity: SafeActivityResponse[];
}

export interface AdminDashboardOverview extends DashboardResponseBase {
  kpis: {
    totalMembers: number;
    totalTeamTasks: number;
    activeTeamTasks: number;
    completedTasks: number;
    overdueTasks: number;
    reviewQueueTasks: number;
    revisionRequiredTasks: number;
    dueSoonTasks: number;
    scopedCompletionRate: number | null;
    myDraftReports: number;
    mySubmittedReports: number;
    myRevisionRequiredReports: number;
  };
  taskStatusCounts: StatusCounts;
  recentActivity: SafeActivityResponse[];
}

export interface MemberDashboardOverview extends DashboardResponseBase {
  kpis: {
    myActiveTasks: number;
    overdueTasks: number;
    dueSoonTasks: number;
    revisionRequiredTasks: number;
    completedTasks: number;
    completionRate: number | null;
    onTimeRate: number | null;
    averageCompletionMinutes: number | null;
    unreadNotificationCount: number;
  };
  taskStatusCounts: StatusCounts;
  recentNotifications: SafeNotificationResponse[];
}

export type DashboardOverviewResponse =
  | SuperAdminDashboardOverview
  | AdminDashboardOverview
  | MemberDashboardOverview;

export interface TeamWorkloadRow {
  teamId: string;
  teamName: string;
  adminId: string;
  memberCount: number;
  activeMemberCount: number;
  activeTasks: number;
  overdueTasks: number;
  reviewQueueTasks: number;
  revisionRequiredTasks: number;
  statusCounts: StatusCounts;
}

export interface MemberWorkloadRow {
  memberId: string;
  name: string;
  employeeId: string | null;
  designation: string | null;
  status: UserStatus;
  teamId: string | null;
  teamName: string | null;
  activeTasks: number;
  overdueTasks: number;
  statusCounts: StatusCounts;
  activePriorityCounts: PriorityCounts;
}

export interface WorkloadPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedMemberWorkload {
  data: MemberWorkloadRow[];
  meta: WorkloadPaginationMeta;
}

export interface SuperAdminDashboardWorkload extends DashboardResponseBase {
  byTeam: TeamWorkloadRow[];
  byMember: PaginatedMemberWorkload;
}

export interface AdminTeamSummaryWorkload {
  performance: Pick<
    PerformanceMetrics,
    | 'totalTasks'
    | 'eligibleTasks'
    | 'completedTasks'
    | 'cancelledTasks'
    | 'completionRate'
  >;
  workload: WorkloadMetrics;
  reviewQueueTasks: number;
  revisionRequiredTasks: number;
}

export interface AdminDashboardWorkload extends DashboardResponseBase {
  teamSummary: AdminTeamSummaryWorkload;
  byMember: PaginatedMemberWorkload;
}

export interface MemberDashboardWorkload extends DashboardResponseBase {
  self: MemberWorkloadRow;
}

export type DashboardWorkloadResponse =
  | SuperAdminDashboardWorkload
  | AdminDashboardWorkload
  | MemberDashboardWorkload;

export interface CompletionTrendPoint {
  date: string;
  completedTasks: number;
}

export interface DashboardTrendsResponse extends DashboardResponseBase {
  completionTrend: CompletionTrendPoint[];
}

export interface DashboardTaskMetricSource {
  id: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}
