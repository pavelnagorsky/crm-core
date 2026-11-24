import { PriceAdjustmentKind } from './enums/price-adjustment-kind.enum.js';
import { PriceRuleKind } from './enums/price-rule-kind.enum.js';
import { PriceRuleSkipReason } from './enums/price-rule-skip-reason.enum.js';
import { PriceRuleTargetType } from './enums/price-rule-target-type.enum.js';
import { PriceScheduleType } from './enums/price-schedule-type.enum.js';
import { PriceValueType } from './enums/price-value-type.enum.js';
import { LineQuote } from './interfaces/line-quote.interface.js';
import { PricingRuleEntry } from './interfaces/pricing-rule-entry.interface.js';
import { QuoteLineRequest } from './interfaces/quote-line-request.interface.js';
import { VisitTime } from './interfaces/visit-time.interface.js';
import { PriceBook } from './price-book.js';
import {
  fixedBundle,
  priceLevel,
  pricingSnapshot,
  pricingStaff,
  quoteLine,
  sumBundle,
  surchargeRule,
  visitAt,
  weekdays,
} from './testing/pricing-snapshot.factory.js';

/**
 * Catalog: cut 60.00 and color 90.00 (category hair), wash 15.00 (care), polish 49.90
 * (nails). Senior level: cut 80.00. 2026-11-23 is a Monday, 2026-12-31 a Thursday.
 */
const { SERVICE, SERVICE_CATEGORY, BUNDLE } = PriceRuleTargetType;
const { PERCENT, AMOUNT } = PriceValueType;
const MONDAY = '2026-11-23';
const NEW_YEAR_EVE = '2026-12-31';
const noon = visitAt(MONDAY, '12:00');

function book(rules: PricingRuleEntry[], roundingStep = 100): PriceBook {
  return new PriceBook(
    pricingSnapshot({
      services: { cut: 6000, color: 9000, wash: 1500, polish: 4990 },
      categories: { cut: 'hair', color: 'hair', wash: 'care', polish: 'nails' },
      levels: [priceLevel('base', 'Базовый', true), priceLevel('senior', 'Старший')],
      levelPrices: { cut: { senior: 8000 } },
      staff: [pricingStaff('anna'), pricingStaff('boris', 'senior')],
      bundles: [
        sumBundle('sum-bundle'),
        fixedBundle('fixed-bundle', 12000),
        fixedBundle('odd-bundle', 4990),
      ],
      rules,
      roundingStep,
    }),
  );
}

function line(
  rules: PricingRuleEntry[],
  serviceId: string,
  visit: VisitTime | null = noon,
  options: { staffId?: string | null; roundingStep?: number; customPrice?: number | null } = {},
): LineQuote {
  return book(rules, options.roundingStep).quote({
    bundleId: null,
    lines: [quoteLine(serviceId, options.customPrice ?? null, options.staffId ?? 'anna')],
    visit,
  }).lines[0];
}

function surcharge(rule: PricingRuleEntry, amount: number) {
  return {
    kind: PriceAdjustmentKind.SURCHARGE,
    ruleId: rule.id,
    title: rule.name,
    publicTitle: null,
    valueType: rule.valueType,
    value: rule.value,
    amount,
  };
}

function rounding(amount: number) {
  return {
    kind: PriceAdjustmentKind.ROUNDING,
    ruleId: null,
    title: 'Округление',
    publicTitle: null,
    valueType: null,
    value: null,
    amount,
  };
}

function expectLayersAddUp(lines: LineQuote[]): void {
  for (const item of lines)
    expect(
      item.staffPrice +
        item.adjustments
          .filter(
            (adjustment) =>
              adjustment.kind === PriceAdjustmentKind.SURCHARGE ||
              adjustment.kind === PriceAdjustmentKind.ROUNDING,
          )
          .reduce((sum, adjustment) => sum + adjustment.amount, 0),
    ).toBe(item.listPrice);
}

const plus15 = surchargeRule('plus15', { name: 'Вечер', value: 1500 });
const plus10 = surchargeRule('plus10', { name: 'Выходные', value: 1000 });
const plus5byn = surchargeRule('plus5byn', {
  name: 'Срочно',
  valueType: AMOUNT,
  value: 500,
});
const evening = surchargeRule('evening', {
  name: 'Вечер',
  value: 2000,
  weekdaysMask: weekdays(1, 2, 3, 4, 5),
  intervals: [{ start: 17 * 60, end: 21 * 60 }],
});
const night = surchargeRule('night', {
  name: 'Ночь',
  value: 1000,
  intervals: [{ start: 22 * 60, end: 1440 }],
});
const holiday = surchargeRule('holiday', {
  name: 'Новый год',
  scheduleType: PriceScheduleType.HOLIDAYS,
  value: 3000,
  dates: [NEW_YEAR_EVE],
  holidayExclusive: true,
});
const holidayExtra = surchargeRule('holiday-extra', {
  name: 'Праздник +5',
  scheduleType: PriceScheduleType.HOLIDAYS,
  valueType: AMOUNT,
  value: 500,
  dates: [NEW_YEAR_EVE],
});

describe('PriceBook: surcharges (docs/pricing-stage3-api.md)', () => {
  describe('quote of a separate service', () => {
    it.each([
      [
        '49.90 + 15% = 57.39 -> 57.00 (step 1.00)',
        [plus15],
        'polish',
        100,
        5700,
        [surcharge(plus15, 749), rounding(-39)],
      ],
      ['step 0.01: no rounding', [plus15], 'polish', 1, 5739, [surcharge(plus15, 749)]],
      [
        'step 0.50',
        [plus15],
        'polish',
        50,
        5750,
        [surcharge(plus15, 749), rounding(11)],
      ],
      ['no surcharge: 49.90 is not rounded', [], 'polish', 100, 4990, []],
      [
        'percent + amount add up from the staff price',
        [plus10, plus5byn],
        'cut',
        100,
        7100,
        [surcharge(plus10, 600), surcharge(plus5byn, 500)],
      ],
      [
        'two percents both from the staff price',
        [plus10, plus15],
        'cut',
        100,
        7500,
        [surcharge(plus10, 600), surcharge(plus15, 900)],
      ],
      [
        'percent + amount with rounding',
        [plus10, plus5byn],
        'polish',
        100,
        6000,
        [surcharge(plus10, 499), surcharge(plus5byn, 500), rounding(11)],
      ],
      [
        'disabled rule',
        [surchargeRule('off', { enabled: false })],
        'cut',
        100,
        6000,
        [],
      ],
    ] as const)('%s', (_name, rules, serviceId, step, listPrice, adjustments) => {
      const quoted = line([...rules], serviceId, noon, { roundingStep: step });
      expect(quoted.listPrice).toBe(listPrice);
      expect(quoted.total).toBe(listPrice);
      expect(quoted.adjustments).toEqual(adjustments);
    });

    it('surcharge counts from the level price and follows the level layer', () => {
      const quoted = line([plus10], 'cut', noon, { staffId: 'boris' });
      expect(quoted).toMatchObject({
        basePrice: 6000,
        staffPrice: 8000,
        listPrice: 8800,
      });
      expect(quoted.adjustments.map((item) => item.kind)).toEqual([
        PriceAdjustmentKind.LEVEL,
        PriceAdjustmentKind.SURCHARGE,
      ]);
    });

    it('no visit time: no surcharges', () => {
      expect(line([plus15], 'polish', null).listPrice).toBe(4990);
    });

    it('a custom price is the total; layers stay as history', () => {
      const quoted = line([plus15], 'polish', noon, { customPrice: 4000 });
      expect(quoted).toMatchObject({ listPrice: 5700, total: 4000 });
    });

    it.each([
      ['16:59: before the interval', '16:59', 6000],
      ['17:00: included', '17:00', 7200],
      ['20:59: included', '20:59', 7200],
      ['21:00: excluded', '21:00', 6000],
    ])('interval boundary %s', (_name, time, listPrice) => {
      expect(line([evening], 'cut', visitAt(MONDAY, time)).listPrice).toBe(
        listPrice,
      );
    });

    it.each([
      ['service target', [[SERVICE, 'cut', false]], false, 6600],
      ['category target', [[SERVICE_CATEGORY, 'hair', false]], false, 6600],
      ['other category', [[SERVICE_CATEGORY, 'nails', false]], false, 6000],
      ['all but this service', [[SERVICE, 'cut', true]], true, 6000],
      ['all but this category', [[SERVICE_CATEGORY, 'hair', true]], true, 6000],
      ['all but another service', [[SERVICE, 'color', true]], true, 6600],
    ] as const)('targets: %s', (_name, targets, appliesToAll, listPrice) => {
      const rule = surchargeRule('r', {
        appliesToAll,
        targets: targets.map(([type, id, excluded]) => ({ type, id, excluded })),
      });
      expect(line([rule], 'cut').listPrice).toBe(listPrice);
    });
  });

  describe('holiday exclusive', () => {
    it.each([
      ['on the holiday only exclusive ones apply', [plus10, holidayExtra, holiday], NEW_YEAR_EVE, 7800],
      ['another day: the others add up', [plus10, holidayExtra, holiday], MONDAY, 6600],
      ['not exclusive holiday adds to the others', [plus10, holidayExtra], NEW_YEAR_EVE, 7100],
      [
        'exclusive holiday for another service does not cancel',
        [plus10, { ...holiday, appliesToAll: false, targets: [{ type: SERVICE, id: 'color', excluded: false }] }],
        NEW_YEAR_EVE,
        6600,
      ],
      [
        'exclusive outside its interval does not cancel',
        [plus10, { ...holiday, intervals: [{ start: 18 * 60, end: 1440 }] }],
        NEW_YEAR_EVE,
        6600,
      ],
    ])('%s', (_name, rules, date, listPrice) => {
      expect(line(rules, 'cut', visitAt(date, '12:00')).listPrice).toBe(listPrice);
    });
  });

  describe('bundles', () => {
    it('SUM bundle: every line its own staff price, surcharge and rounding', () => {
      const quote = book([plus15]).quote({
        bundleId: 'sum-bundle',
        lines: [quoteLine('cut', null, 'boris'), quoteLine('color', null, 'anna')],
        visit: noon,
      });
      expect(quote.lines.map((item) => item.listPrice)).toEqual([9200, 10400]);
      expect(quote.total).toBe(19600);
      expectLayersAddUp(quote.lines);
    });

    it('SUM bundle line matches by its bundle target', () => {
      const rule = surchargeRule('r', {
        appliesToAll: false,
        targets: [{ type: BUNDLE, id: 'sum-bundle', excluded: false }],
      });
      const quote = book([rule]).quote({
        bundleId: 'sum-bundle',
        lines: [quoteLine('cut'), quoteLine('color')],
        visit: noon,
      });
      expect(quote.total).toBe(16500);
    });

    it.each([
      ['all', surchargeRule('r', { value: 1500 }), 13800],
      [
        'bundle target',
        surchargeRule('r', {
          value: 1500,
          appliesToAll: false,
          targets: [{ type: BUNDLE, id: 'fixed-bundle', excluded: false }],
        }),
        13800,
      ],
      [
        'service target does not reach a FIXED bundle',
        surchargeRule('r', {
          appliesToAll: false,
          targets: [{ type: SERVICE, id: 'cut', excluded: false }],
        }),
        12000,
      ],
      [
        'category target does not reach a FIXED bundle',
        surchargeRule('r', {
          appliesToAll: false,
          targets: [{ type: SERVICE_CATEGORY, id: 'hair', excluded: false }],
        }),
        12000,
      ],
      [
        'excluded bundle',
        surchargeRule('r', {
          targets: [{ type: BUNDLE, id: 'fixed-bundle', excluded: true }],
        }),
        12000,
      ],
    ])('FIXED bundle 120.00: %s', (_name, rule, total) => {
      const quote = book([rule]).quote({
        bundleId: 'fixed-bundle',
        lines: [quoteLine('cut', null, 'boris'), quoteLine('color')],
        visit: noon,
      });
      expect(quote.total).toBe(total);
      expect(quote.lines.map((item) => item.basePrice)).toEqual([4800, 7200]);
      expectLayersAddUp(quote.lines);
    });

    it('FIXED bundle 120.00 + 15%: the surcharge is split like the price', () => {
      const quote = book([plus15]).quote({
        bundleId: 'fixed-bundle',
        lines: [quoteLine('cut'), quoteLine('color')],
        visit: noon,
      });
      expect(quote.lines.map((item) => item.listPrice)).toEqual([5520, 8280]);
      expect(quote.lines.map((item) => item.adjustments)).toEqual([
        [surcharge(plus15, 720)],
        [surcharge(plus15, 1080)],
      ]);
    });

    it.each([
      ['step 1.00', 100, 5700, -39],
      ['step 0.50', 50, 5750, 11],
      ['step 0.01', 1, 5739, 0],
    ])(
      'FIXED bundle 49.90 + 15% + 5.00 rounds the bundle price, then splits exactly: %s',
      (_name, step, expectedList, expectedRounding) => {
        const quote = book([plus15], step).quote({
          bundleId: 'odd-bundle',
          lines: [quoteLine('cut'), quoteLine('color'), quoteLine('wash')],
          visit: noon,
        });
        const all = quote.lines.flatMap((item) => item.adjustments);
        const sumOf = (kind: PriceAdjustmentKind) =>
          all
            .filter((item) => item.kind === kind)
            .reduce((sum, item) => sum + item.amount, 0);
        expect(quote.lines.reduce((sum, item) => sum + item.basePrice, 0)).toBe(4990);
        expect(sumOf(PriceAdjustmentKind.SURCHARGE)).toBe(749);
        expect(sumOf(PriceAdjustmentKind.ROUNDING)).toBe(expectedRounding);
        expect(quote.listTotal).toBe(expectedList);
        expect(quote.total).toBe(expectedList);
        expectLayersAddUp(quote.lines);
        for (const item of quote.lines) expect(item.listPrice).toBeGreaterThanOrEqual(0);
      },
    );
  });

  describe('explain: why a rule did not apply', () => {
    const rules = [
      surchargeRule('applied'),
      surchargeRule('disabled', { enabled: false }),
      surchargeRule('period', { visitFrom: '2027-01-01' }),
      surchargeRule('weekday', { weekdaysMask: weekdays(2) }),
      surchargeRule('interval', { intervals: [{ start: 1020, end: 1260 }] }),
      surchargeRule('holiday-date', {
        scheduleType: PriceScheduleType.HOLIDAYS,
        dates: [NEW_YEAR_EVE],
      }),
      surchargeRule('not-targeted', {
        appliesToAll: false,
        targets: [{ type: SERVICE, id: 'color', excluded: false }],
      }),
      surchargeRule('excluded', {
        targets: [{ type: SERVICE_CATEGORY, id: 'hair', excluded: true }],
      }),
    ];

    it('lists every other rule with its first failed check', () => {
      const { quote, notApplied } = book(rules).explain({
        bundleId: null,
        lines: [quoteLine('cut')],
        visit: noon,
      });
      expect(quote.total).toBe(6600);
      expect(notApplied).toEqual([
        { ruleId: 'disabled', kind: PriceRuleKind.SURCHARGE, name: 'disabled', reason: PriceRuleSkipReason.DISABLED },
        { ruleId: 'excluded', kind: PriceRuleKind.SURCHARGE, name: 'excluded', reason: PriceRuleSkipReason.EXCLUDED },
        { ruleId: 'holiday-date', kind: PriceRuleKind.SURCHARGE, name: 'holiday-date', reason: PriceRuleSkipReason.NOT_HOLIDAY_DATE },
        { ruleId: 'interval', kind: PriceRuleKind.SURCHARGE, name: 'interval', reason: PriceRuleSkipReason.OUT_OF_INTERVAL },
        { ruleId: 'not-targeted', kind: PriceRuleKind.SURCHARGE, name: 'not-targeted', reason: PriceRuleSkipReason.NOT_TARGETED },
        { ruleId: 'period', kind: PriceRuleKind.SURCHARGE, name: 'period', reason: PriceRuleSkipReason.OUT_OF_PERIOD },
        { ruleId: 'weekday', kind: PriceRuleKind.SURCHARGE, name: 'weekday', reason: PriceRuleSkipReason.WRONG_WEEKDAY },
      ]);
    });

    it('a rule cancelled by an exclusive holiday', () => {
      const { quote, notApplied } = book([plus10, holiday]).explain({
        bundleId: null,
        lines: [quoteLine('cut')],
        visit: visitAt(NEW_YEAR_EVE, '12:00'),
      });
      expect(quote.total).toBe(7800);
      expect(notApplied).toEqual([
        { ruleId: 'plus10', kind: PriceRuleKind.SURCHARGE, name: 'Выходные', reason: PriceRuleSkipReason.OVERRIDDEN_BY_HOLIDAY },
      ]);
    });

    it('a service target does not reach a FIXED bundle', () => {
      const rule = surchargeRule('r', {
        appliesToAll: false,
        targets: [{ type: SERVICE, id: 'cut', excluded: false }],
      });
      const { notApplied } = book([rule]).explain({
        bundleId: 'fixed-bundle',
        lines: [quoteLine('cut'), quoteLine('color')],
        visit: noon,
      });
      expect(notApplied.map((item) => item.reason)).toEqual([
        PriceRuleSkipReason.NOT_TARGETED,
      ]);
    });

    it('no visit time: nothing to explain', () => {
      expect(
        book(rules).explain({ bundleId: null, lines: [quoteLine('cut')], visit: null })
          .notApplied,
      ).toEqual([]);
    });
  });

  describe('priceRange over dates', () => {
    const week = [
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ];
    const cutWith = (staffId: string | null): QuoteLineRequest[] => [
      quoteLine('cut', null, staffId),
    ];

    it.each([
      ['no rules: base price', [], cutWith(null), week, 6000, 6000],
      ['weekday evenings, base price', [evening], cutWith(null), week, 6000, 7200],
      ['weekday evenings, level staff', [evening], cutWith('boris'), week, 8000, 9600],
      ['only weekend dates: no evening surcharge', [evening], cutWith(null), week.slice(5), 6000, 6000],
      ['whole-day rule: min is raised too', [plus10], cutWith(null), week, 6600, 6600],
      ['evening and night', [evening, night], cutWith(null), week, 6000, 7200],
      ['no dates: base price', [evening], cutWith(null), [], 6000, 6000],
      [
        'exclusive holiday lowers the evening price on its date',
        [surchargeRule('all-day-30', { value: 3000 }), { ...holiday, value: 1000 }],
        cutWith(null),
        [NEW_YEAR_EVE],
        6600,
        6600,
      ],
    ])('%s', (_name, rules, lines, dates, min, max) => {
      expect(book(rules).priceRange({ bundleId: null, lines }, dates)).toEqual({
        min,
        max,
      });
    });

    it('FIXED bundle with staff per line', () => {
      const range = book([evening]).priceRange(
        {
          bundleId: 'fixed-bundle',
          lines: [quoteLine('cut', null, 'boris'), quoteLine('color', null, null)],
        },
        week,
      );
      expect(range).toEqual({ min: 12000, max: 14400 });
    });

    it('SUM bundle with staff per line', () => {
      const range = book([evening]).priceRange(
        {
          bundleId: 'sum-bundle',
          lines: [quoteLine('cut', null, 'boris'), quoteLine('color', null, null)],
        },
        week,
      );
      expect(range).toEqual({ min: 17000, max: 20400 });
    });

    it('a year of dates with many rules takes milliseconds', () => {
      const rules = Array.from({ length: 30 }, (_, index) =>
        surchargeRule(`r${index}`, {
          value: 100 + index,
          weekdaysMask: weekdays((index % 7) + 1),
          intervals: [{ start: 600 + index * 10, end: 720 + index * 10 }],
        }),
      );
      const dates = Array.from({ length: 365 }, (_, index) =>
        new Date(Date.UTC(2027, 0, 1 + index)).toISOString().slice(0, 10),
      );
      const priced = book(rules);
      const started = performance.now();
      const range = priced.priceRange({ bundleId: null, lines: cutWith('boris') }, dates);
      const elapsed = performance.now() - started;
      expect(range.min).toBe(8000);
      expect(range.max).toBeGreaterThan(8000);
      expect(elapsed).toBeLessThan(250);
    });
  });

  describe('daySegments', () => {
    const cut = { bundleId: null, lines: [quoteLine('cut', null, null)] };
    const shape = (rules: PricingRuleEntry[], date: string) =>
      book(rules)
        .daySegments(cut, date)
        .map(({ startMinute, endMinute, quote }) => [startMinute, endMinute, quote.total]);

    it.each([
      ['no rules: one segment', [], MONDAY, [[0, 1440, 6000]]],
      [
        'evening and night',
        [evening, night],
        MONDAY,
        [
          [0, 1020, 6000],
          [1020, 1260, 7200],
          [1260, 1320, 6000],
          [1320, 1440, 6600],
        ],
      ],
      ['weekend: the evening rule is off', [evening], '2026-11-29', [[0, 1440, 6000]]],
      [
        'adjacent intervals of one rule merge',
        [
          surchargeRule('r', {
            intervals: [
              { start: 600, end: 720 },
              { start: 720, end: 900 },
            ],
          }),
        ],
        MONDAY,
        [
          [0, 600, 6000],
          [600, 900, 6600],
          [900, 1440, 6000],
        ],
      ],
      [
        'equal price from different rules stays apart',
        [
          surchargeRule('a', { intervals: [{ start: 600, end: 720 }] }),
          surchargeRule('b', { intervals: [{ start: 720, end: 900 }] }),
        ],
        MONDAY,
        [
          [0, 600, 6000],
          [600, 720, 6600],
          [720, 900, 6600],
          [900, 1440, 6000],
        ],
      ],
      ['whole-day rule', [plus10], MONDAY, [[0, 1440, 6600]]],
    ])('%s', (_name, rules, date, expected) => {
      expect(shape(rules, date)).toEqual(expected);
    });

    it('each segment quotes a visit starting at its first minute', () => {
      const segments = book([evening]).daySegments(cut, MONDAY);
      for (const { startMinute, quote } of segments)
        expect(quote).toEqual(
          book([evening]).quote({ ...cut, visit: { date: MONDAY, minute: startMinute } }),
        );
    });
  });

  it('is deterministic: same snapshot and request, same quote', () => {
    const rules = [plus15, plus5byn, evening, holiday, holidayExtra];
    const request = {
      bundleId: 'odd-bundle',
      lines: [quoteLine('cut'), quoteLine('color'), quoteLine('wash')],
      visit: visitAt(NEW_YEAR_EVE, '18:00'),
    };
    const first = book(rules).quote(request);
    const priced = book([...rules].reverse());
    expect(priced.quote(request)).toEqual(first);
    expect(priced.quote(request)).toEqual(first);
  });

  it('rejects an invalid rounding step', () => {
    expect(() => book([], 0)).toThrow(RangeError);
  });
});
