import { TaskPriority, TaskStatus } from '../../../generated/prisma/enums';
import {
  calculatePerformanceMetrics,
  calculateWorkloadMetrics,
} from '../../../src/modules/performance/performance.calculator';
import type {
  PerformanceTaskMetricSource,
  RevisionMetricSource,
} from '../../../src/modules/performance/performance.interface';

const now = new Date('2026-08-22T10:00:00.000Z');

function task(
  overrides: Partial<PerformanceTaskMetricSource> = {},
): PerformanceTaskMetricSource {
  return {
    id: 'task-a',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.MEDIUM,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe('performance calculator', () => {
  it('returns zero and null metrics for empty task samples', () => {
    expect(calculatePerformanceMetrics([], [])).toEqual({
      totalTasks: 0,
      eligibleTasks: 0,
      completedTasks: 0,
      cancelledTasks: 0,
      completionRate: null,
      onTimeCompleted: 0,
      lateCompleted: 0,
      completedWithDeadline: 0,
      completedWithoutDeadline: 0,
      onTimeRate: null,
      revisionCount: 0,
      tasksWithRevision: 0,
      averageCompletionMinutes: null,
      completionTimeSampleCount: 0,
    });
    expect(calculateWorkloadMetrics([], now)).toEqual({
      activeTasks: 0,
      overdueTasks: 0,
      statusCounts: {
        PENDING: 0,
        ASSIGNED: 0,
        IN_PROGRESS: 0,
        SUBMITTED: 0,
        UNDER_REVIEW: 0,
        COMPLETED: 0,
        REVISION_REQUIRED: 0,
        RESUBMITTED: 0,
        CANCELLED: 0,
      },
      activePriorityCounts: {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        URGENT: 0,
      },
    });
  });

  it('calculates active, completed, cancelled, overdue, and completion rate', () => {
    const tasks = [
      task({
        id: 'task-1',
        status: TaskStatus.COMPLETED,
        startedAt: new Date('2026-08-20T10:00:00.000Z'),
        completedAt: new Date('2026-08-20T12:00:00.000Z'),
      }),
      task({ id: 'task-2', status: TaskStatus.CANCELLED }),
      task({
        id: 'task-3',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.URGENT,
        dueAt: new Date('2026-08-21T10:00:00.000Z'),
      }),
      task({
        id: 'task-4',
        status: TaskStatus.PENDING,
        priority: TaskPriority.LOW,
        dueAt: new Date('2026-08-23T10:00:00.000Z'),
      }),
    ];

    expect(calculatePerformanceMetrics(tasks, [])).toMatchObject({
      totalTasks: 4,
      eligibleTasks: 3,
      completedTasks: 1,
      cancelledTasks: 1,
      completionRate: 33.33,
      averageCompletionMinutes: 120,
      completionTimeSampleCount: 1,
    });
    expect(calculateWorkloadMetrics(tasks, now)).toMatchObject({
      activeTasks: 2,
      overdueTasks: 1,
      activePriorityCounts: {
        LOW: 1,
        MEDIUM: 0,
        HIGH: 0,
        URGENT: 1,
      },
    });
  });

  it('calculates on-time, late, no-deadline, and timing samples', () => {
    const tasks = [
      task({
        id: 'on-time-before',
        status: TaskStatus.COMPLETED,
        dueAt: new Date('2026-08-20T12:00:00.000Z'),
        startedAt: new Date('2026-08-20T10:00:00.000Z'),
        completedAt: new Date('2026-08-20T11:00:00.000Z'),
      }),
      task({
        id: 'on-time-equal',
        status: TaskStatus.COMPLETED,
        dueAt: new Date('2026-08-20T12:00:00.000Z'),
        startedAt: new Date('2026-08-20T10:00:00.000Z'),
        completedAt: new Date('2026-08-20T12:00:00.000Z'),
      }),
      task({
        id: 'late',
        status: TaskStatus.COMPLETED,
        dueAt: new Date('2026-08-20T12:00:00.000Z'),
        startedAt: new Date('2026-08-20T10:00:00.000Z'),
        completedAt: new Date('2026-08-20T13:00:00.000Z'),
      }),
      task({
        id: 'no-deadline',
        status: TaskStatus.COMPLETED,
        startedAt: new Date('2026-08-20T10:00:00.000Z'),
        completedAt: new Date('2026-08-20T11:00:00.000Z'),
      }),
      task({
        id: 'invalid-duration',
        status: TaskStatus.COMPLETED,
        dueAt: new Date('2026-08-20T12:00:00.000Z'),
        startedAt: new Date('2026-08-20T12:00:00.000Z'),
        completedAt: new Date('2026-08-20T11:00:00.000Z'),
      }),
    ];

    expect(calculatePerformanceMetrics(tasks, [])).toMatchObject({
      onTimeCompleted: 3,
      lateCompleted: 1,
      completedWithDeadline: 4,
      completedWithoutDeadline: 1,
      onTimeRate: 75,
      averageCompletionMinutes: 105,
      completionTimeSampleCount: 4,
    });
  });

  it('counts revision decisions and distinct revised tasks independently from current status', () => {
    const revisions: RevisionMetricSource[] = [
      { taskId: 'task-a' },
      { taskId: 'task-a' },
      { taskId: 'task-b' },
    ];

    expect(calculatePerformanceMetrics([], revisions)).toMatchObject({
      revisionCount: 3,
      tasksWithRevision: 2,
    });
  });

  it('keeps completed and cancelled tasks out of active priority counts', () => {
    const workload = calculateWorkloadMetrics(
      [
        task({ status: TaskStatus.COMPLETED, priority: TaskPriority.URGENT }),
        task({ status: TaskStatus.CANCELLED, priority: TaskPriority.HIGH }),
        task({ status: TaskStatus.SUBMITTED, priority: TaskPriority.URGENT }),
      ],
      now,
    );

    expect(workload.statusCounts).toMatchObject({
      COMPLETED: 1,
      CANCELLED: 1,
      SUBMITTED: 1,
    });
    expect(workload.activePriorityCounts).toEqual({
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      URGENT: 1,
    });
  });
});
