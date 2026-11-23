import { PriceRuleSkipReason } from '../enums/price-rule-skip-reason.enum.js';
import { PriceRuleTargetType } from '../enums/price-rule-target-type.enum.js';
import { PriceScheduleType } from '../enums/price-schedule-type.enum.js';
import { PricingRuleEntry } from '../interfaces/pricing-rule-entry.interface.js';
import {
  minuteOf,
  surchargeRule,
  weekdays,
} from '../testing/pricing-snapshot.factory.js';
import { CalendarDayParser } from './calendar-day.parser.js';
import { CompiledRule } from './compiled-rule.js';
import { RuleCompiler } from './rule-compiler.js';

/** 2026-11-23 is a Monday. */
function reasonAt(
  overrides: Partial<PricingRuleEntry>,
  date: string,
  time: string,
): PriceRuleSkipReason | null {
  return new CompiledRule(surchargeRule('r', overrides)).timeReason(
    CalendarDayParser.parse(date),
    minuteOf(time),
  );
}

const evening = { intervals: [{ start: 17 * 60, end: 21 * 60 }] };
const OUT_OF_INTERVAL = PriceRuleSkipReason.OUT_OF_INTERVAL;
const OUT_OF_PERIOD = PriceRuleSkipReason.OUT_OF_PERIOD;
const WRONG_WEEKDAY = PriceRuleSkipReason.WRONG_WEEKDAY;
const NOT_HOLIDAY_DATE = PriceRuleSkipReason.NOT_HOLIDAY_DATE;

describe('CalendarDayParser', () => {
  it.each([
    ['2026-11-23', 1, 20261123, 1123],
    ['2026-11-29', 7, 20261129, 1129],
    ['2024-02-29', 4, 20240229, 229],
    ['2027-01-01', 5, 20270101, 101],
  ])('%s', (date, isoWeekday, ymd, md) => {
    expect(CalendarDayParser.parse(date)).toEqual({
      date,
      ymd,
      md,
      isoWeekday,
    });
  });

  it.each(['2026-02-29', '2026-13-01', '2026-1-01', '26-01-01', 'x', ''])(
    'rejects %s',
    (date) => {
      expect(() => CalendarDayParser.parse(date)).toThrow(RangeError);
    },
  );
});

describe('CompiledRule: time conditions', () => {
  describe('interval: start <= minute < end', () => {
    it.each([
      ['16:59 before', evening, '16:59', OUT_OF_INTERVAL],
      ['17:00 included', evening, '17:00', null],
      ['20:59 included', evening, '20:59', null],
      ['21:00 excluded', evening, '21:00', OUT_OF_INTERVAL],
      ['no intervals: whole day at 00:00', {}, '00:00', null],
      ['no intervals: whole day at 23:59', {}, '23:59', null],
      [
        'end 24:00 covers 23:59',
        { intervals: [{ start: 22 * 60, end: 1440 }] },
        '23:59',
        null,
      ],
      [
        'second interval',
        {
          intervals: [
            { start: 17 * 60, end: 18 * 60 },
            { start: 8 * 60, end: 9 * 60 },
          ],
        },
        '08:30',
        null,
      ],
      [
        'between two intervals',
        {
          intervals: [
            { start: 8 * 60, end: 9 * 60 },
            { start: 17 * 60, end: 18 * 60 },
          ],
        },
        '12:00',
        OUT_OF_INTERVAL,
      ],
    ])('%s', (_name, overrides, time, expected) => {
      expect(reasonAt(overrides, '2026-11-23', time)).toBe(expected);
    });
  });

  describe('weekday (ISO, from the date)', () => {
    it.each([
      ['Monday in Mon-Fri', weekdays(1, 2, 3, 4, 5), '2026-11-23', null],
      ['Sunday not in Mon-Fri', weekdays(1, 2, 3, 4, 5), '2026-11-29', WRONG_WEEKDAY],
      ['Sunday in Sat-Sun', weekdays(6, 7), '2026-11-29', null],
      ['Saturday in Sat-Sun', weekdays(6, 7), '2026-11-28', null],
      ['Friday not in Sat-Sun', weekdays(6, 7), '2026-11-27', WRONG_WEEKDAY],
      ['mask 0: every day', 0, '2026-11-29', null],
    ])('%s', (_name, weekdaysMask, date, expected) => {
      expect(reasonAt({ weekdaysMask }, date, '12:00')).toBe(expected);
    });
  });

  describe('WEEKLY period: optional, inclusive', () => {
    const period = { visitFrom: '2026-12-01', visitTo: '2026-12-31' };
    it.each([
      ['day before', period, '2026-11-30', OUT_OF_PERIOD],
      ['first day', period, '2026-12-01', null],
      ['last day', period, '2026-12-31', null],
      ['day after', period, '2027-01-01', OUT_OF_PERIOD],
      ['open end', { visitFrom: '2026-12-01' }, '2030-01-01', null],
      ['open start', { visitTo: '2026-12-01' }, '2020-01-01', null],
    ])('%s', (_name, overrides, date, expected) => {
      expect(reasonAt(overrides, date, '12:00')).toBe(expected);
    });
  });

  describe('SEASON', () => {
    const winter = {
      scheduleType: PriceScheduleType.SEASON,
      visitFrom: '2026-12-15',
      visitTo: '2027-01-10',
    };
    const yearlyWinter = { ...winter, yearly: true };
    it.each([
      ['once: inside', winter, '2026-12-31', null],
      ['once: next year is out', winter, '2027-12-20', OUT_OF_PERIOD],
      ['yearly across new year: 15.12', yearlyWinter, '2030-12-15', null],
      ['yearly across new year: 31.12', yearlyWinter, '2030-12-31', null],
      ['yearly across new year: 01.01', yearlyWinter, '2031-01-01', null],
      ['yearly across new year: 10.01', yearlyWinter, '2031-01-10', null],
      ['yearly across new year: 11.01', yearlyWinter, '2031-01-11', OUT_OF_PERIOD],
      ['yearly across new year: 14.12', yearlyWinter, '2031-12-14', OUT_OF_PERIOD],
      ['yearly across new year: summer', yearlyWinter, '2031-07-01', OUT_OF_PERIOD],
      [
        'yearly inside one year',
        {
          scheduleType: PriceScheduleType.SEASON,
          visitFrom: '2026-06-01',
          visitTo: '2026-08-31',
          yearly: true,
        },
        '2020-07-15',
        null,
      ],
      [
        'season weekdays',
        { ...yearlyWinter, weekdaysMask: weekdays(6, 7) },
        '2026-12-21',
        WRONG_WEEKDAY,
      ],
    ])('%s', (_name, overrides, date, expected) => {
      expect(reasonAt(overrides, date, '12:00')).toBe(expected);
    });
  });

  describe('HOLIDAYS', () => {
    const once = {
      scheduleType: PriceScheduleType.HOLIDAYS,
      dates: ['2026-12-31', '2027-01-07'],
    };
    const leapDay = {
      scheduleType: PriceScheduleType.HOLIDAYS,
      dates: ['2024-02-29'],
      yearly: true,
    };
    it.each([
      ['once: listed date', once, '2026-12-31', null],
      ['once: second date', once, '2027-01-07', null],
      ['once: next year', once, '2027-12-31', NOT_HOLIDAY_DATE],
      ['once: other date', once, '2026-12-30', NOT_HOLIDAY_DATE],
      [
        'yearly: any year',
        { ...once, yearly: true },
        '2035-12-31',
        null,
      ],
      ['yearly 29.02: leap year 2028', leapDay, '2028-02-29', null],
      ['yearly 29.02: not 28.02 of 2027', leapDay, '2027-02-28', NOT_HOLIDAY_DATE],
      ['yearly 29.02: not 01.03 of 2027', leapDay, '2027-03-01', NOT_HOLIDAY_DATE],
      [
        'interval is checked before the date',
        { ...once, intervals: [{ start: 8 * 60, end: 9 * 60 }] },
        '2026-12-30',
        OUT_OF_INTERVAL,
      ],
    ])('%s', (_name, overrides, date, expected) => {
      expect(reasonAt(overrides, date, '18:00')).toBe(expected);
    });
  });

  it.each([
    ['disabled first', { enabled: false, weekdaysMask: weekdays(2) }, PriceRuleSkipReason.DISABLED],
    [
      'period before weekday',
      { visitFrom: '2027-01-01', weekdaysMask: weekdays(2) },
      OUT_OF_PERIOD,
    ],
    ['weekday before interval', { weekdaysMask: weekdays(2), ...evening }, WRONG_WEEKDAY],
  ])('check order: %s', (_name, overrides, expected) => {
    expect(reasonAt(overrides, '2026-11-23', '12:00')).toBe(expected);
  });

  it('breakpoints are the inner interval edges', () => {
    const rule = new CompiledRule(
      surchargeRule('r', {
        intervals: [
          { start: 1320, end: 1440 },
          { start: 0, end: 480 },
          { start: 1020, end: 1260 },
        ],
      }),
    );
    expect([...rule.breakpoints].sort((a, b) => a - b)).toEqual([
      480, 1020, 1260, 1320,
    ]);
  });

  it.each([
    ['start >= end', { start: 600, end: 600 }],
    ['end past 24:00', { start: 600, end: 1441 }],
    ['negative start', { start: -1, end: 600 }],
  ])('rejects interval: %s', (_name, interval) => {
    expect(
      () => new CompiledRule(surchargeRule('r', { intervals: [interval] })),
    ).toThrow(RangeError);
  });
});

describe('CompiledRule: targets', () => {
  const { SERVICE, SERVICE_CATEGORY, BUNDLE } = PriceRuleTargetType;
  const cutLine = { serviceId: 'cut', categoryId: 'hair', bundleId: null };
  const sumLine = { serviceId: 'cut', categoryId: 'hair', bundleId: 'sum' };
  const fixedPackage = { serviceId: null, categoryId: null, bundleId: 'fixed' };

  it.each([
    ['all', true, [], cutLine, null],
    ['all reaches a FIXED bundle', true, [], fixedPackage, null],
    ['all, service excluded', true, [[SERVICE, 'cut', true]], cutLine, 'EXCLUDED'],
    [
      'all, category excluded',
      true,
      [[SERVICE_CATEGORY, 'hair', true]],
      cutLine,
      'EXCLUDED',
    ],
    ['all, FIXED bundle excluded', true, [[BUNDLE, 'fixed', true]], fixedPackage, 'EXCLUDED'],
    [
      'all, category excluded does not reach a FIXED bundle',
      true,
      [[SERVICE_CATEGORY, 'hair', true]],
      fixedPackage,
      null,
    ],
    ['service target', false, [[SERVICE, 'cut', false]], cutLine, null],
    ['category target', false, [[SERVICE_CATEGORY, 'hair', false]], cutLine, null],
    ['other service', false, [[SERVICE, 'color', false]], cutLine, 'NOT_TARGETED'],
    ['SUM bundle line by service', false, [[SERVICE, 'cut', false]], sumLine, null],
    ['SUM bundle line by its bundle', false, [[BUNDLE, 'sum', false]], sumLine, null],
    ['FIXED bundle by bundle target', false, [[BUNDLE, 'fixed', false]], fixedPackage, null],
    [
      'FIXED bundle ignores service targets',
      false,
      [[SERVICE, 'cut', false]],
      fixedPackage,
      'NOT_TARGETED',
    ],
    [
      'FIXED bundle ignores category targets',
      false,
      [[SERVICE_CATEGORY, 'hair', false]],
      fixedPackage,
      'NOT_TARGETED',
    ],
  ] as const)('%s', (_name, appliesToAll, targets, context, expected) => {
    const rule = new CompiledRule(
      surchargeRule('r', {
        appliesToAll,
        targets: targets.map(([type, id, excluded]) => ({ type, id, excluded })),
      }),
    );
    expect(rule.targetReason(context)).toBe(expected);
  });
});

describe('RuleCompiler', () => {
  it('orders rules by createdAt, then id', () => {
    const set = RuleCompiler.compile([
      surchargeRule('b', { createdAt: '2026-02-01T00:00:00.000Z' }),
      surchargeRule('c', { createdAt: '2026-01-01T00:00:00.000Z' }),
      surchargeRule('a', { createdAt: '2026-02-01T00:00:00.000Z' }),
    ]);
    expect(set.rules.map((rule) => rule.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps disabled rules but leaves them out of a day', () => {
    const set = RuleCompiler.compile([
      surchargeRule('on'),
      surchargeRule('off', { enabled: false }),
    ]);
    expect(set.rules).toHaveLength(2);
    expect(set.onDate('2026-11-23').rules.map((rule) => rule.id)).toEqual([
      'on',
    ]);
  });
});
