import { TimeUtils } from './time.utils.js';

describe('TimeUtils local datetime conversion', () => {
  it.each([
    ['2026-10-17T23:15:45', 'Europe/Moscow', '2026-10-17T20:15:45.000Z'],
    ['2026-10-17T01:15:45', 'America/New_York', '2026-10-17T05:15:45.000Z'],
    ['2026-10-17T00:00:00', 'Asia/Kathmandu', '2026-10-16T18:15:00.000Z'],
    ['2026-01-01T00:00:00', 'Pacific/Kiritimati', '2025-12-31T10:00:00.000Z'],
    ['2026-10-17T23:15:45', 'UTC', '2026-10-17T23:15:45.000Z'],
    ['2026-11-01T01:30:00', 'America/New_York', '2026-11-01T05:30:00.000Z'],
    ['2026-03-08T02:30:00', 'America/New_York', '2026-03-08T07:30:00.000Z'],
    ['2026-10-04T02:15:00', 'Australia/Lord_Howe', '2026-10-03T15:45:00.000Z'],
  ])('converts %s in %s to %s', (local, timezone, expected) => {
    expect(TimeUtils.localToUtc(local, timezone).toISOString()).toBe(expected);
  });

  it('keeps calendar-day arithmetic correct across a daylight saving transition', () => {
    const start = TimeUtils.zonedDayStart(2026, 3, 8, 'America/New_York');
    const next = TimeUtils.addDaysInTz(start, 1, 'America/New_York');
    expect(next.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(next.getTime() - start.getTime()).toBe(23 * 3_600_000);
  });
});

describe('TimeUtils date-only helpers', () => {
  it('parses and formats UTC date-only values without TZ drift', () => {
    const d = TimeUtils.dateOnly('2026-09-15');
    expect(d.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(TimeUtils.dateOnlyStr(d)).toBe('2026-09-15');
  });

  it('uses calendar days of the UTC month', () => {
    expect(TimeUtils.daysInUtcMonth(TimeUtils.dateOnly('2026-02-01'))).toBe(28);
    expect(TimeUtils.daysInUtcMonth(TimeUtils.dateOnly('2026-09-30'))).toBe(30);
    expect(TimeUtils.daysInUtcMonth(TimeUtils.dateOnly('2026-01-31'))).toBe(31);
  });
});
