import { PriceScheduleType } from '@prisma/client';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { priceRuleRecord } from '../testing/price-rule-record.factory.js';
import { toPricingRuleEntry } from './price-rule-entry.rules.js';
import {
  nextRuleDate,
  priceRuleSchedule,
} from './price-rule-schedule.rules.js';

const MONDAY = 1;
const FRIDAY = 1 << 4;
const SATURDAY = 1 << 5;

// 2026-11-23 is a Monday.
const TODAY = '2026-11-23';

const schedule = (
  options: Parameters<typeof priceRuleRecord>[0],
  today = TODAY,
) => priceRuleSchedule(priceRuleRecord(options), today);

describe('nextRuleDate', () => {
  const next = (
    options: Parameters<typeof priceRuleRecord>[0],
    today = TODAY,
  ) => nextRuleDate(toPricingRuleEntry(priceRuleRecord(options)), today);

  it('is today when the rule works every day', () => {
    expect(next({})).toBe(TODAY);
  });

  it('finds the next matching weekday, today included', () => {
    expect(next({ weekdaysMask: MONDAY })).toBe('2026-11-23');
    expect(next({ weekdaysMask: FRIDAY | SATURDAY })).toBe('2026-11-27');
  });

  it('waits for the start of the period', () => {
    expect(next({ visitFrom: '2026-12-10' })).toBe('2026-12-10');
    expect(next({ visitFrom: '2026-12-10', weekdaysMask: MONDAY })).toBe(
      '2026-12-14',
    );
  });

  it('is null after the period ended', () => {
    expect(next({ visitTo: '2026-11-22' })).toBeNull();
    expect(next({ visitTo: '2026-11-23' })).toBe(TODAY);
  });

  it('does not depend on the enabled flag', () => {
    expect(next({ enabled: false })).toBe(TODAY);
  });

  it('finds the next occurrence of a yearly season, also across the new year', () => {
    const season = {
      scheduleType: PriceScheduleType.SEASON,
      yearly: true,
      visitFrom: '2026-12-15',
      visitTo: '2027-01-10',
    };
    expect(next(season, '2026-11-23')).toBe('2026-12-15');
    expect(next(season, '2027-01-05')).toBe('2027-01-05');
    expect(next(season, '2027-01-11')).toBe('2027-12-15');
  });

  it('picks the nearest of the dates of a one-off holiday list', () => {
    const holidays = {
      scheduleType: PriceScheduleType.HOLIDAYS,
      dates: ['2027-03-08', '2026-12-31', '2026-11-01'],
    };
    expect(next(holidays)).toBe('2026-12-31');
    expect(next(holidays, '2027-01-01')).toBe('2027-03-08');
    expect(next(holidays, '2027-03-09')).toBeNull();
  });

  it('matches yearly holidays by month and day', () => {
    const holidays = {
      scheduleType: PriceScheduleType.HOLIDAYS,
      yearly: true,
      dates: ['2026-03-08'],
    };
    expect(next(holidays)).toBe('2027-03-08');
  });

  it('applies weekdays to holidays too', () => {
    const holidays = {
      scheduleType: PriceScheduleType.HOLIDAYS,
      dates: ['2026-12-31', '2027-01-01'],
      weekdaysMask: FRIDAY,
    };
    // 2026-12-31 is a Thursday, 2027-01-01 a Friday.
    expect(next(holidays)).toBe('2027-01-01');
  });

  it('finds 29 February of a yearly holiday in the next leap year', () => {
    const holidays = {
      scheduleType: PriceScheduleType.HOLIDAYS,
      yearly: true,
      dates: ['2028-02-29'],
    };
    expect(next(holidays)).toBe('2028-02-29');
  });
});

describe('priceRuleSchedule', () => {
  describe('WEEKLY', () => {
    it('is ACTIVE without a period, with the next working weekday', () => {
      expect(schedule({ weekdaysMask: FRIDAY })).toEqual({
        status: PriceRuleStatus.ACTIVE,
        nextDate: '2026-11-27',
      });
    });

    it('is ACTIVE inside the period and SCHEDULED before it', () => {
      expect(
        schedule({ visitFrom: '2026-11-01', visitTo: '2026-12-31' }).status,
      ).toBe(PriceRuleStatus.ACTIVE);
      expect(schedule({ visitFrom: '2026-12-01' })).toEqual({
        status: PriceRuleStatus.SCHEDULED,
        nextDate: '2026-12-01',
      });
    });

    it('is ENDED with no next date after the period', () => {
      expect(schedule({ visitTo: '2026-11-22' })).toEqual({
        status: PriceRuleStatus.ENDED,
        nextDate: null,
      });
    });
  });

  describe('SEASON', () => {
    const base = { scheduleType: PriceScheduleType.SEASON };

    it('is ACTIVE on the last day and ENDED the day after', () => {
      const options = {
        ...base,
        visitFrom: '2026-11-01',
        visitTo: '2026-11-23',
      };
      expect(schedule(options).status).toBe(PriceRuleStatus.ACTIVE);
      expect(schedule(options, '2026-11-24')).toEqual({
        status: PriceRuleStatus.ENDED,
        nextDate: null,
      });
    });

    it('is SCHEDULED before the start', () => {
      expect(
        schedule({ ...base, visitFrom: '2026-12-15', visitTo: '2027-01-10' }),
      ).toEqual({ status: PriceRuleStatus.SCHEDULED, nextDate: '2026-12-15' });
    });

    it('a yearly season is ACTIVE inside its months, also over the new year', () => {
      const yearly = {
        ...base,
        yearly: true,
        visitFrom: '2026-12-15',
        visitTo: '2027-01-10',
      };
      expect(schedule(yearly, '2027-01-05').status).toBe(
        PriceRuleStatus.ACTIVE,
      );
      expect(schedule(yearly, '2026-12-20').status).toBe(
        PriceRuleStatus.ACTIVE,
      );
    });

    it('a yearly season outside its months is SCHEDULED for the next year, never ENDED', () => {
      const yearly = {
        ...base,
        yearly: true,
        visitFrom: '2026-12-15',
        visitTo: '2027-01-10',
      };
      expect(schedule(yearly, '2027-02-01')).toEqual({
        status: PriceRuleStatus.SCHEDULED,
        nextDate: '2027-12-15',
      });
    });
  });

  describe('HOLIDAYS', () => {
    const holidays = {
      scheduleType: PriceScheduleType.HOLIDAYS,
      dates: ['2026-11-23', '2026-12-31'],
    };

    it('is ACTIVE on a holiday date', () => {
      expect(schedule(holidays)).toEqual({
        status: PriceRuleStatus.ACTIVE,
        nextDate: '2026-11-23',
      });
    });

    it('is SCHEDULED between holidays and ENDED after the last one', () => {
      expect(schedule(holidays, '2026-11-24')).toEqual({
        status: PriceRuleStatus.SCHEDULED,
        nextDate: '2026-12-31',
      });
      expect(schedule(holidays, '2027-01-01')).toEqual({
        status: PriceRuleStatus.ENDED,
        nextDate: null,
      });
    });

    it('a yearly holiday list is never ENDED', () => {
      expect(schedule({ ...holidays, yearly: true }, '2027-01-01')).toEqual({
        status: PriceRuleStatus.SCHEDULED,
        nextDate: '2027-11-23',
      });
    });
  });

  describe('disabled and archived', () => {
    it('is DISABLED without a next date', () => {
      expect(schedule({ enabled: false })).toEqual({
        status: PriceRuleStatus.DISABLED,
        nextDate: null,
      });
    });

    it('is ARCHIVED, before DISABLED, without a next date', () => {
      expect(
        schedule({ enabled: false, archivedAt: new Date('2026-11-20') }),
      ).toEqual({ status: PriceRuleStatus.ARCHIVED, nextDate: null });
    });
  });
});
