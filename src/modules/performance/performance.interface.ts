import type {
  TaskPriority,
  TaskStatus,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';
import type { PERFORMANCE_WINDOW } from './performance.constant.js';

export type PerformanceWindow =
  (typeof PERFORMANCE_WINDOW)[keyof typeof PERFORMANCE_WINDOW];

export type StatusCounts = Record<TaskStatus, number>;
export type PriorityCounts = Record<TaskPriority, number>;

export interface PerformanceMetricContext {
  performanceWindow: PerformanceWindow;
  asOf: Date;
}

export interface PerformanceMetrics {
  totalTasks: number;
  eligibleTasks: number;
  completedTasks: number;
  cancelledTasks: number;
  completionRate: number | null;
  onTimeCompleted: number;
  lateCompleted: number;
  completedWithDeadline: number;
  completedWithoutDeadline: number;
  onTimeRate: number | null;
  revisionCount: number;
  tasksWithRevision: number;
  averageCompletionMinutes: number | null;
  completionTimeSampleCount: number;
}

export interface WorkloadMetrics {
  activeTasks: number;
  overdueTasks: number;
  statusCounts: StatusCounts;
  activePriorityCounts: PriorityCounts;
}

export interface PerformanceTaskMetricSource {
  id: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface RevisionMetricSource {
  taskId: string;
}

export interface MemberPerformanceIdentity {
  id: string;
  name: string;
  employeeId: string | null;
  designation: string | null;
  status: UserStatus;
  teamId: string | null;
  teamName: string | null;
}

export interface TeamPerformanceIdentity {
  id: string;
  name: string;
  adminId: string;
  memberCount: number;
  activeMemberCount: number;
}

export interface MemberPerformanceSummary {
  member: MemberPerformanceIdentity;
  performance: PerformanceMetrics;
  workload: WorkloadMetrics;
}

export interface MemberPerformanceDetailResponse extends MemberPerformanceSummary {
  metricContext: PerformanceMetricContext;
}

export interface PaginatedMemberPerformanceResponse {
  data: MemberPerformanceSummary[];
  meta: PaginationMeta;
  metricContext: PerformanceMetricContext;
}

export interface TeamPerformanceResponse {
  team: TeamPerformanceIdentity;
  performance: PerformanceMetrics;
  workload: WorkloadMetrics;
  metricContext: PerformanceMetricContext;
}
