import {
  ManagementReportStatus,
  TaskStatus,
} from '../../../generated/prisma/enums.js';
import { DateTime } from 'luxon';
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

export function buildZonedCompletionTrend(
  completedTasks: { completedAt: Date | null }[],
  days: number,
  now: Date,
  timezone: string,
): CompletionTrendPoint[] {
  const end = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(timezone);
  const start = end.startOf('day').minus({ days: days - 1 });
  const buckets = Array.from({ length: days }, (_, index) => ({
    date: start.plus({ days: index }).toFormat('yyyy-LL-dd'),
    completedTasks: 0,
  }));
  const bucketByDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));

  for (const task of completedTasks) {
    if (task.completedAt === null) continue;
    const date = DateTime.fromJSDate(task.completedAt, { zone: 'utc' })
      .setZone(timezone)
      .toFormat('yyyy-LL-dd');
    const bucket = bucketByDate.get(date);
    if (bucket) bucket.completedTasks += 1;
  }

  return buckets;
}

export function startOfZonedTrendWindow(
  days: number,
  now: Date,
  timezone: string,
): Date {
  return DateTime.fromJSDate(now, { zone: 'utc' })
    .setZone(timezone)
    .startOf('day')
    .minus({ days: days - 1 })
    .toUTC()
    .toJSDate();
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
