import { getBusinessMonthWindow } from '../../../src/shared/time/business-time';

describe('business month window', () => {
  const timezone = 'Asia/Dhaka';

  it('opens at local midnight on the first day of the month', () => {
    const window = getBusinessMonthWindow(
      new Date('2026-08-22T10:00:00.000Z'),
      timezone,
    );

    // 2026-08-01 00:00 and 2026-09-01 00:00 in Asia/Dhaka.
    expect(window.start.toISOString()).toBe('2026-07-31T18:00:00.000Z');
    expect(window.endExclusive.toISOString()).toBe('2026-08-31T18:00:00.000Z');
  });

  it('keeps the last local second of the month inside the window', () => {
    const window = getBusinessMonthWindow(
      new Date('2026-11-30T17:59:59.999Z'),
      timezone,
    );

    expect(window.start.toISOString()).toBe('2026-10-31T18:00:00.000Z');
    expect(window.endExclusive.toISOString()).toBe('2026-11-30T18:00:00.000Z');
  });

  it('starts a fresh window at the new month without touching stored data', () => {
    const november = getBusinessMonthWindow(
      new Date('2026-11-30T17:59:59.999Z'),
      timezone,
    );
    const december = getBusinessMonthWindow(
      new Date('2026-11-30T18:00:00.000Z'),
      timezone,
    );

    expect(december.start.toISOString()).toBe('2026-11-30T18:00:00.000Z');
    expect(december.endExclusive.toISOString()).toBe(
      '2026-12-31T18:00:00.000Z',
    );
    expect(december.start.getTime()).toBe(november.endExclusive.getTime());
  });
});
