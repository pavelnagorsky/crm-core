import {
  PriceRuleKind,
  PriceRuleTargetType,
  PriceScheduleType,
  PriceValueType,
  PromotionChannel,
} from '@prisma/client';
import { PriceRuleInputDto } from '../dto/price-rule-input.dto.js';
import {
  maskToWeekdays,
  normalizePriceRuleInput,
  weekdaysToMask,
} from './price-rule-input.rules.js';

const weekly = (over: Partial<PriceRuleInputDto> = {}): PriceRuleInputDto => ({
  scheduleType: PriceScheduleType.WEEKLY,
  name: 'Evening',
  valueType: PriceValueType.PERCENT,
  value: '20.00',
  weekdays: [5, 6],
  appliesToAllServices: true,
  ...over,
});

const season = (over: Partial<PriceRuleInputDto> = {}): PriceRuleInputDto => ({
  scheduleType: PriceScheduleType.SEASON,
  name: 'New year',
  valueType: PriceValueType.AMOUNT,
  value: '10.00',
  visitFrom: '2026-12-15',
  visitTo: '2027-01-10',
  appliesToAllServices: true,
  ...over,
});

const holidays = (
  over: Partial<PriceRuleInputDto> = {},
): PriceRuleInputDto => ({
  scheduleType: PriceScheduleType.HOLIDAYS,
  name: 'March 8',
  valueType: PriceValueType.PERCENT,
  value: '30.00',
  dates: ['2027-03-08'],
  appliesToAllServices: true,
  ...over,
});

const invalidField = (input: PriceRuleInputDto): string | undefined => {
  try {
    normalizePriceRuleInput(input);
  } catch (error) {
    const exception = error as {
      errorCode: string;
      payload: { field: string };
    };
    expect(exception.errorCode).toBe('PRICE_RULE_INVALID');
    return exception.payload.field;
  }
  return undefined;
};

describe('weekday masks', () => {
  it('sets bit isoWeekday - 1', () => {
    expect(weekdaysToMask([1])).toBe(1);
    expect(weekdaysToMask([5, 6])).toBe(0b0110000);
    expect(weekdaysToMask([1, 2, 3, 4, 5, 6, 7])).toBe(127);
  });

  it('turns a mask back into ascending weekdays', () => {
    expect(maskToWeekdays(0b0110000)).toEqual([5, 6]);
    expect(maskToWeekdays(0)).toEqual([]);
  });
});

describe('normalizePriceRuleInput', () => {
  describe('common fields', () => {
    it('trims the name, drops an empty note and normalizes the value', () => {
      const rule = normalizePriceRuleInput(
        weekly({ name: '  Evening  ', note: '   ', value: '20.5' }),
      );
      expect(rule).toMatchObject({
        name: 'Evening',
        note: null,
        value: '20.50',
      });
    });

    it('leaves enabled to the caller when it is not given', () => {
      expect(normalizePriceRuleInput(weekly()).enabled).toBeNull();
      expect(normalizePriceRuleInput(weekly({ enabled: false })).enabled).toBe(
        false,
      );
    });

    it('rejects an empty name', () => {
      expect(invalidField(weekly({ name: '   ' }))).toBe('name');
    });

    it.each([
      ['1000.00', PriceValueType.PERCENT, undefined],
      ['1000.01', PriceValueType.PERCENT, 'value'],
      ['0.00', PriceValueType.PERCENT, 'value'],
      ['-5.00', PriceValueType.PERCENT, 'value'],
      ['5.001', PriceValueType.PERCENT, 'value'],
      ['abc', PriceValueType.PERCENT, 'value'],
      ['99999999.99', PriceValueType.AMOUNT, undefined],
      ['100000000.00', PriceValueType.AMOUNT, 'value'],
    ])('checks value %s of a %s rule', (value, valueType, field) => {
      expect(invalidField(weekly({ value, valueType }))).toBe(field);
    });
  });

  describe('weekdays and intervals', () => {
    it('stores the weekday mask', () => {
      expect(
        normalizePriceRuleInput(weekly({ weekdays: [1, 7] })).weekdaysMask,
      ).toBe(0b1000001);
    });

    it.each([[[0]], [[8]], [[1, 1]], [[1.5]]])(
      'rejects weekdays %j',
      (days) => {
        expect(invalidField(weekly({ weekdays: days }))).toBe('weekdays');
      },
    );

    it('sorts the intervals and reads 24:00 as the end of the day', () => {
      const rule = normalizePriceRuleInput(
        weekly({
          intervals: [
            { start: '17:00', end: '24:00' },
            { start: '09:00', end: '12:30' },
          ],
        }),
      );
      expect(rule.intervals).toEqual([
        { startMinute: 540, endMinute: 750 },
        { startMinute: 1020, endMinute: 1440 },
      ]);
    });

    it('allows an interval that starts where the previous one ends', () => {
      expect(() =>
        normalizePriceRuleInput(
          weekly({
            intervals: [
              { start: '09:00', end: '12:00' },
              { start: '12:00', end: '15:00' },
            ],
          }),
        ),
      ).not.toThrow();
    });

    it.each([
      [[{ start: '12:00', end: '12:00' }]],
      [[{ start: '13:00', end: '12:00' }]],
      [
        [
          { start: '09:00', end: '12:00' },
          { start: '11:59', end: '15:00' },
        ],
      ],
      [[{ start: '24:00', end: '24:00' }]],
      [[{ start: '9:00', end: '12:00' }]],
    ])('rejects the intervals %j', (intervals) => {
      expect(invalidField(weekly({ intervals }))).toBe('intervals');
    });
  });

  describe('WEEKLY', () => {
    it('requires weekdays', () => {
      expect(invalidField(weekly({ weekdays: [] }))).toBe('weekdays');
      expect(invalidField(weekly({ weekdays: undefined }))).toBe('weekdays');
    });

    it('takes an optional period', () => {
      expect(
        normalizePriceRuleInput(weekly({ visitFrom: '2026-12-01' })),
      ).toMatchObject({ visitFrom: '2026-12-01', visitTo: null });
      expect(
        normalizePriceRuleInput(
          weekly({ visitFrom: '2026-12-01', visitTo: '2026-12-01' }),
        ),
      ).toMatchObject({ visitFrom: '2026-12-01', visitTo: '2026-12-01' });
    });

    it('rejects a period that ends before it starts', () => {
      expect(
        invalidField(
          weekly({ visitFrom: '2026-12-02', visitTo: '2026-12-01' }),
        ),
      ).toBe('visitTo');
    });

    it('rejects a date that is not on the calendar', () => {
      expect(invalidField(weekly({ visitFrom: '2026-02-30' }))).toBe(
        'visitFrom',
      );
    });

    it.each([
      ['yearly', { yearly: true }],
      ['holidayExclusive', { holidayExclusive: true }],
      ['dates', { dates: ['2026-12-31'] }],
    ])('rejects the %s of another schedule type', (field, over) => {
      expect(invalidField(weekly(over))).toBe(field);
    });

    it('accepts false flags as absent', () => {
      expect(() =>
        normalizePriceRuleInput(
          weekly({ yearly: false, holidayExclusive: false, dates: [] }),
        ),
      ).not.toThrow();
    });
  });

  describe('SEASON', () => {
    it('requires both ends of the period', () => {
      expect(invalidField(season({ visitFrom: undefined }))).toBe('visitFrom');
      expect(invalidField(season({ visitTo: null }))).toBe('visitTo');
    });

    it('lets a yearly season cross the new year', () => {
      expect(() =>
        normalizePriceRuleInput(season({ yearly: true })),
      ).not.toThrow();
      expect(
        normalizePriceRuleInput(
          season({
            yearly: true,
            visitFrom: '2026-12-15',
            visitTo: '2026-01-10',
          }),
        ),
      ).toMatchObject({ yearly: true });
    });

    it('needs visitFrom <= visitTo without yearly', () => {
      expect(
        invalidField(
          season({ visitFrom: '2027-01-11', visitTo: '2027-01-10' }),
        ),
      ).toBe('visitTo');
    });

    it('takes weekdays, empty meaning every day', () => {
      expect(normalizePriceRuleInput(season()).weekdaysMask).toBe(0);
      expect(
        normalizePriceRuleInput(season({ weekdays: [6, 7] })).weekdaysMask,
      ).toBe(0b1100000);
    });

    it.each([
      ['holidayExclusive', { holidayExclusive: true }],
      ['dates', { dates: ['2026-12-31'] }],
    ])('rejects the %s of another schedule type', (field, over) => {
      expect(invalidField(season(over))).toBe(field);
    });
  });

  describe('HOLIDAYS', () => {
    it('sorts and de-duplicates the dates', () => {
      const rule = normalizePriceRuleInput(
        holidays({ dates: ['2027-03-08', '2026-12-31', '2027-03-08'] }),
      );
      expect(rule.dates).toEqual(['2026-12-31', '2027-03-08']);
    });

    it('takes yearly and holidayExclusive', () => {
      expect(
        normalizePriceRuleInput(
          holidays({ yearly: true, holidayExclusive: true }),
        ),
      ).toMatchObject({ yearly: true, holidayExclusive: true });
    });

    it('needs 1 to 100 real dates', () => {
      expect(invalidField(holidays({ dates: [] }))).toBe('dates');
      expect(invalidField(holidays({ dates: undefined }))).toBe('dates');
      expect(invalidField(holidays({ dates: ['2027-02-29'] }))).toBe('dates');
      const days = Array.from({ length: 101 }, (_, index) => {
        const date = new Date(Date.UTC(2027, 0, 1 + index));
        return date.toISOString().slice(0, 10);
      });
      expect(invalidField(holidays({ dates: days }))).toBe('dates');
      expect(
        invalidField(holidays({ dates: days.slice(0, 100) })),
      ).toBeUndefined();
    });

    it('accepts 29 February of a leap year', () => {
      expect(() =>
        normalizePriceRuleInput(
          holidays({ dates: ['2028-02-29'], yearly: true }),
        ),
      ).not.toThrow();
    });

    it('rejects a period', () => {
      expect(invalidField(holidays({ visitFrom: '2027-01-01' }))).toBe(
        'visitFrom',
      );
      expect(invalidField(holidays({ visitTo: '2027-01-01' }))).toBe('visitTo');
    });

    it('allows weekdays and intervals on holidays', () => {
      const rule = normalizePriceRuleInput(
        holidays({
          weekdays: [1],
          intervals: [{ start: '10:00', end: '12:00' }],
        }),
      );
      expect(rule.weekdaysMask).toBe(1);
      expect(rule.intervals).toEqual([{ startMinute: 600, endMinute: 720 }]);
    });
  });

  describe('targets', () => {
    const service = { type: PriceRuleTargetType.SERVICE, id: 'cut' };
    const category = { type: PriceRuleTargetType.SERVICE_CATEGORY, id: 'hair' };

    it('needs at least one target when the rule does not apply to all', () => {
      expect(invalidField(weekly({ appliesToAllServices: false }))).toBe('targets');
      expect(invalidField(weekly({ appliesToAllServices: false, targets: [] }))).toBe(
        'targets',
      );
    });

    it('keeps listed targets as included', () => {
      const rule = normalizePriceRuleInput(
        weekly({ appliesToAllServices: false, targets: [service, category] }),
      );
      expect(rule.targets).toEqual([
        { type: 'SERVICE', id: 'cut', excluded: false },
        { type: 'SERVICE_CATEGORY', id: 'hair', excluded: false },
      ]);
    });

    it('takes only exclusions when the rule applies to all', () => {
      expect(
        normalizePriceRuleInput(
          weekly({ targets: [{ ...service, excluded: true }] }),
        ).targets,
      ).toEqual([{ type: 'SERVICE', id: 'cut', excluded: true }]);
      expect(invalidField(weekly({ targets: [service] }))).toBe('targets');
    });

    it('rejects an exclusion on a rule that applies to a list', () => {
      expect(
        invalidField(
          weekly({
            appliesToAllServices: false,
            targets: [service, { ...category, excluded: true }],
          }),
        ),
      ).toBe('targets');
    });

    it('rejects a target listed twice', () => {
      expect(
        invalidField(
          weekly({ appliesToAllServices: false, targets: [service, service] }),
        ),
      ).toBe('targets');
    });

    describe('by kind (docs/pricing-stage7-api.md)', () => {
      const product = { type: PriceRuleTargetType.PRODUCT, id: 'shampoo' };
      const productCategory = {
        type: PriceRuleTargetType.PRODUCT_CATEGORY,
        id: 'care',
      };
      const promotion = (
        over: Partial<PriceRuleInputDto> = {},
      ): PriceRuleInputDto =>
        weekly({
          kind: PriceRuleKind.PROMOTION,
          publicName: 'Акция',
          channels: [PromotionChannel.ADMIN],
          ...over,
        });

      it('all services with listed products: services excluded, products included', () => {
        const rule = normalizePriceRuleInput(
          promotion({
            targets: [{ ...service, excluded: true }, product, productCategory],
          }),
        );
        expect(rule.appliesToAllServices).toBe(true);
        expect(rule.appliesToAllProducts).toBe(false);
        expect(rule.targets).toEqual([
          { type: 'SERVICE', id: 'cut', excluded: true },
          { type: 'PRODUCT', id: 'shampoo', excluded: false },
          { type: 'PRODUCT_CATEGORY', id: 'care', excluded: false },
        ]);
      });

      it('all products takes only product exclusions', () => {
        const rule = normalizePriceRuleInput(
          promotion({
            appliesToAllServices: false,
            appliesToAllProducts: true,
            targets: [{ ...product, excluded: true }, service],
          }),
        );
        expect(rule.appliesToAllProducts).toBe(true);
        expect(rule.targets).toHaveLength(2);
        expect(
          invalidField(
            promotion({
              appliesToAllServices: false,
              appliesToAllProducts: true,
              targets: [product],
            }),
          ),
        ).toBe('targets');
      });

      it('a product exclusion without "all products" is 400', () => {
        expect(
          invalidField(promotion({ targets: [{ ...product, excluded: true }] })),
        ).toBe('targets');
      });

      it('only products: valid without services', () => {
        expect(
          normalizePriceRuleInput(
            promotion({ appliesToAllServices: false, targets: [product] }),
          ).targets,
        ).toEqual([{ type: 'PRODUCT', id: 'shampoo', excluded: false }]);
        expect(
          normalizePriceRuleInput(
            promotion({ appliesToAllServices: false, appliesToAllProducts: true }),
          ).targets,
        ).toEqual([]);
      });

      it('needs something included: only product exclusions is 400', () => {
        expect(
          invalidField(
            promotion({
              appliesToAllServices: false,
              targets: [{ ...product, excluded: true }],
            }),
          ),
        ).toBe('targets');
      });

      it('a surcharge with product targets or "all products" is 400', () => {
        expect(
          invalidField(
            weekly({ appliesToAllServices: false, targets: [product] }),
          ),
        ).toBe('targets');
        expect(invalidField(weekly({ appliesToAllProducts: true }))).toBe(
          'targets',
        );
        expect(
          invalidField(
            weekly({ targets: [{ ...productCategory, excluded: true }] }),
          ),
        ).toBe('targets');
      });
    });

    it('treats the same id of another type as another target', () => {
      expect(
        invalidField(
          weekly({
            appliesToAllServices: false,
            targets: [
              { type: PriceRuleTargetType.SERVICE, id: 'x' },
              { type: PriceRuleTargetType.BUNDLE, id: 'x' },
            ],
          }),
        ),
      ).toBeUndefined();
    });
  });
});
