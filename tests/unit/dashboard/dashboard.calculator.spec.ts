import {
  ManagementReportStatus,
  TaskPriority,
  TaskStatus,
} from '../../../generated/prisma/enums';
import {
  buildCompletionTrend,
  createEmptyReportStatusCounts,
  isTaskDueSoon,
  startOfUtcTrendWindow,
} from '../../../src/modules/dashboard/dashboard.calculator';
import type { DashboardTaskMetricSource } from '../../../src/modules/dashboard/dashboard.interface';

const now = new Date('2026-08-22T10:00:00.000Z');

function task(
  overrides: Partial<DashboardTaskMetricSource> = {},
): DashboardTaskMetricSource {
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

describe('dashboard calculator', () => {
  it('keeps due soon separate from overdue with exact boundaries', () => {
    expect(
      isTaskDueSoon(task({ dueAt: new Date('2026-08-22T09:59:59.999Z') }), now),
    ).toBe(false);
    expect(isTaskDueSoon(task({ dueAt: now }), now)).toBe(true);
    expect(
      isTaskDueSoon(task({ dueAt: new Date('2026-08-29T09:59:59.999Z') }), now),
    ).toBe(true);
    expect(
      isTaskDueSoon(task({ dueAt: new Date('2026-08-29T10:00:00.000Z') }), now),
    ).toBe(false);
    expect(
      isTaskDueSoon(
        task({
          status: TaskStatus.COMPLETED,
          dueAt: new Date('2026-08-23T10:00:00.000Z'),
        }),
        now,
      ),
    ).toBe(false);
  });

  it('zero fills every management report status', () => {
    expect(createEmptyReportStatusCounts()).toEqual({
      [ManagementReportStatus.DRAFT]: 0,
      [ManagementReportStatus.SUBMITTED]: 0,
      [ManagementReportStatus.UNDER_REVIEW]: 0,
      [ManagementReportStatus.REVISION_REQUIRED]: 0,
      [ManagementReportStatus.APPROVED]: 0,
    });
  });

  it('uses UTC calendar days for trend start instead of rolling hours', () => {
    expect(startOfUtcTrendWindow(7, now).toISOString()).toBe(
      '2026-08-16T00:00:00.000Z',
    );
  });

  it('zero fills completion trend buckets and ignores missing completedAt', () => {
    expect(
      buildCompletionTrend(
        [
          { completedAt: new Date('2026-08-16T00:01:00.000Z') },
          { completedAt: new Date('2026-08-18T23:59:00.000Z') },
          { completedAt: new Date('2026-08-18T01:00:00.000Z') },
          { completedAt: null },
        ],
        7,
        now,
      ),
    ).toEqual([
      { date: '2026-08-16', completedTasks: 1 },
      { date: '2026-08-17', completedTasks: 0 },
      { date: '2026-08-18', completedTasks: 2 },
      { date: '2026-08-19', completedTasks: 0 },
      { date: '2026-08-20', completedTasks: 0 },
      { date: '2026-08-21', completedTasks: 0 },
      { date: '2026-08-22', completedTasks: 0 },
    ]);
  });
});
