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

describe('TimeUtils zoned date-time formatting', () => {
  it('formats an instant on the Minsk wall clock', () => {
    expect(
      TimeUtils.zonedDateTimeStr(
        new Date('2026-11-11T07:00:00.000Z'),
        'Europe/Minsk',
      ),
    ).toBe('11.11.2026 10:00');
  });

  it('rolls over to the next local day', () => {
    expect(
      TimeUtils.zonedDateTimeStr(
        new Date('2026-11-11T21:30:00.000Z'),
        'Europe/Minsk',
      ),
    ).toBe('12.11.2026 00:30');
  });

  it('rolls back to the previous local day west of UTC', () => {
    expect(
      TimeUtils.zonedDateTimeStr(
        new Date('2026-11-11T03:15:00.000Z'),
        'America/New_York',
      ),
    ).toBe('10.11.2026 22:15');
  });

  it('follows the daylight saving offset change', () => {
    expect(
      TimeUtils.zonedDateTimeStr(
        new Date('2026-03-08T06:59:00.000Z'),
        'America/New_York',
      ),
    ).toBe('08.03.2026 01:59');
    expect(
      TimeUtils.zonedDateTimeStr(
        new Date('2026-03-08T07:00:00.000Z'),
        'America/New_York',
      ),
    ).toBe('08.03.2026 03:00');
    expect(
      TimeUtils.zonedDateTimeStr(
        new Date('2026-07-01T16:00:00.000Z'),
        'America/New_York',
      ),
    ).toBe('01.07.2026 12:00');
  });
});

describe('TimeUtils zoned calendar-day ranges', () => {
  it('maps inclusive days to half-open bounds in the timezone', () => {
    const range = TimeUtils.zonedDaysRange(
      '2026-11-01',
      '2026-11-30',
      'America/New_York',
    );
    expect(range.gte?.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(range.lt?.toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });

  it('leaves a missing side open', () => {
    const range = TimeUtils.zonedDaysRange(
      undefined,
      '2026-11-11',
      'Europe/Minsk',
    );
    expect(range.gte).toBeUndefined();
    expect(range.lt?.toISOString()).toBe('2026-11-11T21:00:00.000Z');
  });
});
