import {
  ManagementReportStatus,
  TaskPriority,
  TaskStatus,
} from '../../../generated/prisma/enums';
import {
  buildZonedCompletionTrend,
  createEmptyReportStatusCounts,
  isTaskDueSoon,
  startOfZonedTrendWindow,
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

  it('uses the configured business-day boundary for Today', () => {
    expect(startOfZonedTrendWindow(1, now, 'Asia/Dhaka').toISOString()).toBe(
      '2026-08-21T18:00:00.000Z',
    );
    expect(
      buildZonedCompletionTrend(
        [
          { completedAt: new Date('2026-08-21T17:59:59.999Z') },
          { completedAt: new Date('2026-08-21T18:00:00.000Z') },
        ],
        1,
        now,
        'Asia/Dhaka',
      ),
    ).toEqual([{ date: '2026-08-22', completedTasks: 1 }]);
  });

  it('starts a 7-day Asia/Dhaka window at local midnight', () => {
    // 2026-08-22 16:00 in Dhaka; the window opens 2026-08-16 00:00 Dhaka.
    expect(startOfZonedTrendWindow(7, now, 'Asia/Dhaka').toISOString()).toBe(
      '2026-08-15T18:00:00.000Z',
    );
  });

  it('buckets completions by the Asia/Dhaka calendar day, never by UTC', () => {
    expect(
      buildZonedCompletionTrend(
        [
          // 2026-08-18T20:00Z is 2026-08-19 02:00 in Asia/Dhaka.
          { completedAt: new Date('2026-08-18T20:00:00.000Z') },
          // 2026-08-18T17:59Z is still 2026-08-18 23:59 in Asia/Dhaka.
          { completedAt: new Date('2026-08-18T17:59:00.000Z') },
          // Outside the window: 2026-08-15 23:59 in Asia/Dhaka.
          { completedAt: new Date('2026-08-15T17:59:00.000Z') },
          { completedAt: null },
        ],
        7,
        now,
        'Asia/Dhaka',
      ),
    ).toEqual([
      { date: '2026-08-16', completedTasks: 0 },
      { date: '2026-08-17', completedTasks: 0 },
      { date: '2026-08-18', completedTasks: 1 },
      { date: '2026-08-19', completedTasks: 1 },
      { date: '2026-08-20', completedTasks: 0 },
      { date: '2026-08-21', completedTasks: 0 },
      { date: '2026-08-22', completedTasks: 0 },
    ]);
  });
});
