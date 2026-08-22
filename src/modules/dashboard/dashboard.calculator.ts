import {
  ManagementReportStatus,
  TaskStatus,
} from '../../../generated/prisma/enums.js';
import {
  calculatePerformanceMetrics,
  calculateWorkloadMetrics,
  createEmptyStatusCounts,
} from '../performance/performance.calculator.js';
import type {
  CompletionTrendPoint,
  DashboardTaskMetricSource,
  ReportStatusCounts,
} from './dashboard.interface.js';
import { DASHBOARD_DUE_SOON_WINDOW_DAYS } from './dashboard.constant.js';

const ACTIVE_EXCLUDED_STATUSES = new Set<TaskStatus>([
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
]);

const REVIEW_QUEUE_STATUSES = new Set<TaskStatus>([
  TaskStatus.SUBMITTED,
  TaskStatus.RESUBMITTED,
]);

export function createEmptyReportStatusCounts(): ReportStatusCounts {
  return Object.fromEntries(
    Object.values(ManagementReportStatus).map((status) => [status, 0]),
  ) as ReportStatusCounts;
}

export function calculateTaskKpis(
  tasks: DashboardTaskMetricSource[],
  now: Date,
) {
  const performance = calculatePerformanceMetrics(tasks, []);
  const workload = calculateWorkloadMetrics(tasks, now);

  return {
    totalTasks: performance.totalTasks,
    activeTasks: workload.activeTasks,
    completedTasks: performance.completedTasks,
    cancelledTasks: performance.cancelledTasks,
    overdueTasks: workload.overdueTasks,
    reviewQueueTasks: tasks.filter((task) =>
      REVIEW_QUEUE_STATUSES.has(task.status),
    ).length,
    revisionRequiredTasks: tasks.filter(
      (task) => task.status === TaskStatus.REVISION_REQUIRED,
    ).length,
    completionRate: performance.completionRate,
    statusCounts: workload.statusCounts,
  };
}

export function isTaskDueSoon(
  task: Pick<DashboardTaskMetricSource, 'dueAt' | 'status'>,
  now: Date,
): boolean {
  const dueSoonEnd = new Date(
    now.getTime() + DASHBOARD_DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  return (
    task.dueAt !== null &&
    task.dueAt >= now &&
    task.dueAt < dueSoonEnd &&
    !ACTIVE_EXCLUDED_STATUSES.has(task.status)
  );
}

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function buildUtcTrendBuckets(
  days: number,
  now: Date,
): CompletionTrendPoint[] {
  const start = startOfUtcTrendWindow(days, now);

  return Array.from({ length: days }, (_, index) => {
    const bucketDate = new Date(start);
    bucketDate.setUTCDate(start.getUTCDate() + index);

    return {
      date: formatUtcDate(bucketDate),
      completedTasks: 0,
    };
  });
}

export function startOfUtcTrendWindow(days: number, now: Date): Date {
  const start = startOfUtcDay(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return start;
}

export function buildCompletionTrend(
  completedTasks: { completedAt: Date | null }[],
  days: number,
  now: Date,
): CompletionTrendPoint[] {
  const buckets = buildUtcTrendBuckets(days, now);
  const bucketByDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));

  for (const task of completedTasks) {
    if (task.completedAt === null) {
      continue;
    }

    const bucket = bucketByDate.get(formatUtcDate(task.completedAt));

    if (bucket) {
      bucket.completedTasks += 1;
    }
  }

  return buckets;
}

export function createTaskStatusCountsFromTasks(
  tasks: Pick<DashboardTaskMetricSource, 'status'>[],
) {
  const counts = createEmptyStatusCounts();

  for (const task of tasks) {
    counts[task.status] += 1;
  }

  return counts;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
