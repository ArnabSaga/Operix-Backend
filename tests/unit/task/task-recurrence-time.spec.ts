import {
  TaskRecurrenceFrequency,
  TaskStatus,
} from '../../../generated/prisma/enums';
import { shouldMaterializeNextOccurrence } from '../../../src/modules/task/task-recurrence.policy';
import {
  createRecurrenceAnchor,
  getNextFutureOccurrence,
  getNextOccurrence,
  getOccurrenceKey,
  isOccurrenceKey,
} from '../../../src/shared/time/business-time';

describe('business recurrence time', () => {
  const timezone = 'Asia/Dhaka';

  it('clamps monthly month ends without drifting the original anchor', () => {
    const january = new Date('2027-01-31T11:00:00.000Z');
    const anchor = createRecurrenceAnchor(
      january,
      timezone,
      TaskRecurrenceFrequency.MONTHLY,
    );
    const february = getNextOccurrence(
      january,
      timezone,
      TaskRecurrenceFrequency.MONTHLY,
      anchor,
    );
    const march = getNextOccurrence(
      february,
      timezone,
      TaskRecurrenceFrequency.MONTHLY,
      anchor,
    );

    expect(february.toISOString()).toBe('2027-02-28T11:00:00.000Z');
    expect(march.toISOString()).toBe('2027-03-31T11:00:00.000Z');
  });

  it('preserves the fifth at the same business-local time across months', () => {
    const october = new Date('2026-10-05T03:00:00.000Z');
    const anchor = createRecurrenceAnchor(
      october,
      timezone,
      TaskRecurrenceFrequency.MONTHLY,
    );
    const november = getNextOccurrence(
      october,
      timezone,
      TaskRecurrenceFrequency.MONTHLY,
      anchor,
    );
    const december = getNextOccurrence(
      november,
      timezone,
      TaskRecurrenceFrequency.MONTHLY,
      anchor,
    );

    expect(november.toISOString()).toBe('2026-11-05T03:00:00.000Z');
    expect(december.toISOString()).toBe('2026-12-05T03:00:00.000Z');
  });

  it('preserves weekly business-local time and calculates semantic keys', () => {
    const monday = new Date('2026-09-07T10:30:00.000Z');
    const anchor = createRecurrenceAnchor(
      monday,
      timezone,
      TaskRecurrenceFrequency.WEEKLY,
    );
    const next = getNextOccurrence(
      monday,
      timezone,
      TaskRecurrenceFrequency.WEEKLY,
      anchor,
    );

    expect(next.toISOString()).toBe('2026-09-14T10:30:00.000Z');
    expect(getOccurrenceKey(next, timezone)).toBe('2026-09-14');
    expect(isOccurrenceKey('2026-09-14')).toBe(true);
    expect(isOccurrenceKey('2026-13-40')).toBe(false);
  });

  it('resumes at the next future anchor without backfilling paused cycles', () => {
    const anchorDate = new Date('2026-09-25T11:00:00.000Z');
    const anchor = createRecurrenceAnchor(
      anchorDate,
      timezone,
      TaskRecurrenceFrequency.MONTHLY,
    );
    const resumed = getNextFutureOccurrence(
      anchorDate,
      new Date('2026-11-10T00:00:00.000Z'),
      timezone,
      TaskRecurrenceFrequency.MONTHLY,
      anchor,
    );

    expect(resumed.toISOString()).toBe('2026-11-25T11:00:00.000Z');
  });
});

describe('recurrence materialization horizon', () => {
  const now = new Date('2026-09-30T00:00:00.000Z');

  it('does not create a premature future occurrence when an older task completes late', () => {
    expect(
      shouldMaterializeNextOccurrence(
        [
          {
            dueAt: new Date('2026-10-25T11:00:00.000Z'),
            status: TaskStatus.ASSIGNED,
          },
          {
            dueAt: new Date('2026-09-25T11:00:00.000Z'),
            status: TaskStatus.COMPLETED,
          },
        ],
        new Date('2026-11-25T11:00:00.000Z'),
        now,
      ),
    ).toBe(false);
  });

  it('allows the next occurrence after the latest occurrence completes early', () => {
    expect(
      shouldMaterializeNextOccurrence(
        [
          {
            dueAt: new Date('2026-10-25T11:00:00.000Z'),
            status: TaskStatus.COMPLETED,
          },
        ],
        new Date('2026-11-25T11:00:00.000Z'),
        now,
      ),
    ).toBe(true);
  });

  it('allows a later cycle when the latest occurrence is overdue', () => {
    expect(
      shouldMaterializeNextOccurrence(
        [
          {
            dueAt: new Date('2026-09-25T11:00:00.000Z'),
            status: TaskStatus.IN_PROGRESS,
          },
        ],
        new Date('2026-10-25T11:00:00.000Z'),
        new Date('2026-10-25T11:00:00.000Z'),
      ),
    ).toBe(true);
  });
});
