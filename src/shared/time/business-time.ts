import { DateTime } from 'luxon';
import { TaskRecurrenceFrequency } from '../../../generated/prisma/enums.js';

export interface RecurrenceAnchor {
  anchorLocalDay: number | null;
  anchorLocalWeekday: number | null;
  anchorLocalTime: string;
}

export function createRecurrenceAnchor(
  dueAt: Date,
  timezone: string,
  frequency: TaskRecurrenceFrequency,
): RecurrenceAnchor {
  const local = DateTime.fromJSDate(dueAt, { zone: 'utc' }).setZone(timezone);
  return {
    anchorLocalDay:
      frequency === TaskRecurrenceFrequency.MONTHLY ? local.day : null,
    anchorLocalWeekday:
      frequency === TaskRecurrenceFrequency.WEEKLY ? local.weekday : null,
    anchorLocalTime: local.toFormat('HH:mm:ss.SSS'),
  };
}

export function getOccurrenceKey(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date, { zone: 'utc' })
    .setZone(timezone)
    .toFormat('yyyy-LL-dd');
}

export function isOccurrenceKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return DateTime.fromFormat(value, 'yyyy-LL-dd', { zone: 'utc' }).isValid;
}

export interface BusinessMonthWindow {
  /** First instant of the current business month. */
  start: Date;
  /** First instant of the next business month; exclusive upper bound. */
  endExclusive: Date;
}

/**
 * Current calendar-month window in the configured business timezone.
 *
 * Dashboard monthly metrics are query windows, never data resets: stored rows
 * keep their history and only the reporting window moves at the month boundary.
 */
export function getBusinessMonthWindow(
  now: Date,
  timezone: string,
): BusinessMonthWindow {
  const local = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(timezone);
  const startOfMonth = local.startOf('month');

  return {
    start: startOfMonth.toUTC().toJSDate(),
    endExclusive: startOfMonth.plus({ months: 1 }).toUTC().toJSDate(),
  };
}

export function getNextOccurrence(
  current: Date,
  timezone: string,
  frequency: TaskRecurrenceFrequency,
  anchor: RecurrenceAnchor,
): Date {
  const local = DateTime.fromJSDate(current, { zone: 'utc' }).setZone(timezone);
  const [hour, minute, second, millisecond] = anchor.anchorLocalTime
    .split(/[:.]/)
    .map(Number);

  if (frequency === TaskRecurrenceFrequency.WEEKLY) {
    const target = local.plus({ weeks: 1 }).set({
      hour,
      minute,
      second,
      millisecond,
    });
    return target.toUTC().toJSDate();
  }

  const nextMonth = local.plus({ months: 1 }).startOf('month');
  const day = Math.min(
    anchor.anchorLocalDay ?? local.day,
    nextMonth.daysInMonth!,
  );
  return nextMonth
    .set({ day, hour, minute, second, millisecond })
    .toUTC()
    .toJSDate();
}

export function getNextFutureOccurrence(
  from: Date,
  now: Date,
  timezone: string,
  frequency: TaskRecurrenceFrequency,
  anchor: RecurrenceAnchor,
): Date {
  let candidate = from;
  while (candidate <= now) {
    candidate = getNextOccurrence(candidate, timezone, frequency, anchor);
  }
  return candidate;
}
