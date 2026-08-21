import { TaskPriority, TaskStatus } from '../../../generated/prisma/enums.js';
import { isTaskOverdue } from '../task/task.mapper.js';
import type {
  PerformanceMetrics,
  PerformanceTaskMetricSource,
  PriorityCounts,
  RevisionMetricSource,
  StatusCounts,
  WorkloadMetrics,
} from './performance.interface.js';

const TASK_STATUSES = Object.values(TaskStatus);
const TASK_PRIORITIES = Object.values(TaskPriority);
const TERMINAL_STATUSES = new Set<TaskStatus>([
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
]);

export function calculatePerformanceMetrics(
  tasks: PerformanceTaskMetricSource[],
  revisions: RevisionMetricSource[],
): PerformanceMetrics {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(
    (task) => task.status === TaskStatus.COMPLETED,
  ).length;
  const cancelledTasks = tasks.filter(
    (task) => task.status === TaskStatus.CANCELLED,
  ).length;
  const eligibleTasks = totalTasks - cancelledTasks;
  const completionRate =
    eligibleTasks === 0
      ? null
      : roundMetric((completedTasks / eligibleTasks) * 100);

  let onTimeCompleted = 0;
  let lateCompleted = 0;
  let completedWithoutDeadline = 0;
  const completionDurations: number[] = [];

  for (const task of tasks) {
    if (task.status !== TaskStatus.COMPLETED) {
      continue;
    }

    if (task.dueAt === null) {
      completedWithoutDeadline += 1;
    } else if (task.completedAt !== null && task.completedAt <= task.dueAt) {
      onTimeCompleted += 1;
    } else if (task.completedAt !== null && task.completedAt > task.dueAt) {
      lateCompleted += 1;
    }

    if (
      task.startedAt !== null &&
      task.completedAt !== null &&
      task.completedAt >= task.startedAt
    ) {
      completionDurations.push(
        task.completedAt.getTime() - task.startedAt.getTime(),
      );
    }
  }

  const completedWithDeadline = onTimeCompleted + lateCompleted;
  const onTimeRate =
    completedWithDeadline === 0
      ? null
      : roundMetric((onTimeCompleted / completedWithDeadline) * 100);
  const completionTimeSampleCount = completionDurations.length;
  const averageCompletionMinutes =
    completionTimeSampleCount === 0
      ? null
      : roundMetric(
          completionDurations.reduce((total, duration) => total + duration, 0) /
            completionTimeSampleCount /
            60_000,
        );
  const revisionTaskIds = new Set(revisions.map((revision) => revision.taskId));

  return {
    totalTasks,
    eligibleTasks,
    completedTasks,
    cancelledTasks,
    completionRate,
    onTimeCompleted,
    lateCompleted,
    completedWithDeadline,
    completedWithoutDeadline,
    onTimeRate,
    revisionCount: revisions.length,
    tasksWithRevision: revisionTaskIds.size,
    averageCompletionMinutes,
    completionTimeSampleCount,
  };
}

export function calculateWorkloadMetrics(
  tasks: PerformanceTaskMetricSource[],
  now: Date,
): WorkloadMetrics {
  const statusCounts = createEmptyStatusCounts();
  const activePriorityCounts = createEmptyPriorityCounts();
  let activeTasks = 0;
  let overdueTasks = 0;

  for (const task of tasks) {
    statusCounts[task.status] += 1;

    if (!TERMINAL_STATUSES.has(task.status)) {
      activeTasks += 1;
      activePriorityCounts[task.priority] += 1;
    }

    if (isTaskOverdue(task, now)) {
      overdueTasks += 1;
    }
  }

  return {
    activeTasks,
    overdueTasks,
    statusCounts,
    activePriorityCounts,
  };
}

export function createEmptyStatusCounts(): StatusCounts {
  return Object.fromEntries(
    TASK_STATUSES.map((status) => [status, 0]),
  ) as StatusCounts;
}

export function createEmptyPriorityCounts(): PriorityCounts {
  return Object.fromEntries(
    TASK_PRIORITIES.map((priority) => [priority, 0]),
  ) as PriorityCounts;
}

function roundMetric(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
