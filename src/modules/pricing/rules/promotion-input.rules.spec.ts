import {
  PriceRuleKind,
  PriceScheduleType,
  PriceValueType,
  PromotionChannel,
  PromotionClientFilter,
  PromotionLimitPeriod,
  PromotionScenario,
} from '@prisma/client';
import { PriceRuleInputDto } from '../dto/price-rule-input.dto.js';
import { PROMO_CODE_ALPHABET } from '../constants/price-rule.constants.js';
import {
  normalizePriceRuleInput,
  normalizePromoCode,
} from './price-rule-input.rules.js';
import { randomPromoCode } from './promo-code.rules.js';

const promotion = (
  over: Partial<PriceRuleInputDto> = {},
): PriceRuleInputDto => ({
  kind: PriceRuleKind.PROMOTION,
  scheduleType: PriceScheduleType.WEEKLY,
  name: 'Утро',
  valueType: PriceValueType.PERCENT,
  value: '20.00',
  appliesToAll: true,
  publicName: 'Счастливые часы',
  channels: [PromotionChannel.ONLINE],
  ...over,
});

const invalidField = (input: PriceRuleInputDto): string | undefined => {
  try {
    normalizePriceRuleInput(input);
  } catch (error) {
    const exception = error as {
      errorCode?: string;
      payload?: { field?: string };
    };
    expect(exception.errorCode).toBe('PRICE_RULE_INVALID');
    return exception.payload?.field;
  }
  return undefined;
};

describe('normalizePriceRuleInput: promotions (docs/pricing-stage4-api.md)', () => {
  it('normalizes a full promotion', () => {
    const rule = normalizePriceRuleInput(
      promotion({
        scenario: PromotionScenario.PROMO_CODE,
        publicName: '  Осень  ',
        publicDescription: '  ',
        bookingFrom: '2026-11-01',
        bookingTo: '2026-11-30',
        minLeadMinutes: 60,
        maxLeadMinutes: 600,
        channels: [PromotionChannel.ADMIN, PromotionChannel.ONLINE],
        staffIds: ['b', 'a', 'b'],
        clientFilter: PromotionClientFilter.BIRTHDAY,
        birthdayWindowDays: 7,
        promoCode: ' autumn-15 ',
        usageLimitTotal: 100,
        usageLimitPerClient: 1,
        usageLimitPeriod: PromotionLimitPeriod.YEAR,
        minVisitTotal: '40.5',
      }),
    );
    expect(rule).toMatchObject({
      kind: PriceRuleKind.PROMOTION,
      weekdaysMask: 0,
      value: '20.00',
      promotion: {
        scenario: PromotionScenario.PROMO_CODE,
        publicName: 'Осень',
        publicDescription: null,
        showAsPromotion: true,
        bookingFrom: '2026-11-01',
        bookingTo: '2026-11-30',
        minLeadMinutes: 60,
        maxLeadMinutes: 600,
        channels: [PromotionChannel.ONLINE, PromotionChannel.ADMIN],
        staffIds: ['a', 'b'],
        clientFilter: PromotionClientFilter.BIRTHDAY,
        birthdayWindowDays: 7,
        promoCode: 'AUTUMN-15',
        usageLimitTotal: 100,
        usageLimitPerClient: 1,
        usageLimitPeriod: PromotionLimitPeriod.YEAR,
        minVisitTotal: '40.50',
      },
    });
  });

  it('defaults: any client, shown as a promotion, no code', () => {
    expect(normalizePriceRuleInput(promotion()).promotion).toMatchObject({
      clientFilter: PromotionClientFilter.ANY,
      showAsPromotion: true,
      promoCode: null,
      birthdayWindowDays: null,
    });
  });

  it('a surcharge stays without promotion fields', () => {
    const rule = normalizePriceRuleInput({
      scheduleType: PriceScheduleType.WEEKLY,
      name: 'Вечер',
      valueType: PriceValueType.PERCENT,
      value: '20.00',
      weekdays: [5],
      appliesToAll: true,
    });
    expect(rule).toMatchObject({ kind: PriceRuleKind.SURCHARGE, promotion: null });
  });

  it.each([
    ['a schedule other than WEEKLY', { scheduleType: PriceScheduleType.SEASON, visitFrom: '2026-12-01', visitTo: '2026-12-31' }, 'scheduleType'],
    ['percent above 100', { value: '100.01' }, 'value'],
    ['no public name', { publicName: '   ' }, 'publicName'],
    ['no channels', { channels: [] }, 'channels'],
    ['repeated channel', { channels: [PromotionChannel.ONLINE, PromotionChannel.ONLINE] }, 'channels'],
    ['booking period backwards', { bookingFrom: '2026-12-01', bookingTo: '2026-11-30' }, 'bookingTo'],
    ['impossible booking date', { bookingFrom: '2026-02-30' }, 'bookingFrom'],
    ['negative lead', { minLeadMinutes: -1 }, 'minLeadMinutes'],
    ['min lead above max lead', { minLeadMinutes: 120, maxLeadMinutes: 60 }, 'maxLeadMinutes'],
    ['birthday without a window', { clientFilter: PromotionClientFilter.BIRTHDAY }, 'birthdayWindowDays'],
    ['a window without birthday', { birthdayWindowDays: 3 }, 'birthdayWindowDays'],
    ['window above 30 days', { clientFilter: PromotionClientFilter.BIRTHDAY, birthdayWindowDays: 31 }, 'birthdayWindowDays'],
    ['code too short', { promoCode: 'AB' }, 'promoCode'],
    ['code with a space', { promoCode: 'AUT UMN' }, 'promoCode'],
    ['code with Cyrillic', { promoCode: 'ОСЕНЬ' }, 'promoCode'],
    ['zero total limit', { usageLimitTotal: 0 }, 'usageLimitTotal'],
    ['per-client limit without a period', { usageLimitPerClient: 1 }, 'usageLimitPeriod'],
    ['a period without a per-client limit', { usageLimitPeriod: PromotionLimitPeriod.MONTH }, 'usageLimitPerClient'],
    ['zero minimum total', { minVisitTotal: '0.00' }, 'minVisitTotal'],
    ['minimum total with 3 decimals', { minVisitTotal: '1.005' }, 'minVisitTotal'],
  ] as const)('rejects %s', (_name, over, field) => {
    expect(invalidField(promotion({ ...over } as Partial<PriceRuleInputDto>))).toBe(field);
  });

  it.each([
    ['publicName', { publicName: 'X' }],
    ['channels', { channels: [PromotionChannel.ONLINE] }],
    ['promoCode', { promoCode: 'AUTUMN' }],
    ['staffIds', { staffIds: ['a'] }],
    ['clientFilter', { clientFilter: PromotionClientFilter.ANY }],
    ['showAsPromotion', { showAsPromotion: true }],
    ['minVisitTotal', { minVisitTotal: '10.00' }],
  ] as const)('rejects a surcharge with %s', (field, over) => {
    expect(
      invalidField({
        scheduleType: PriceScheduleType.WEEKLY,
        name: 'Вечер',
        valueType: PriceValueType.PERCENT,
        value: '20.00',
        weekdays: [5],
        appliesToAll: true,
        ...(over as Partial<PriceRuleInputDto>),
      }),
    ).toBe(field);
  });

  it('a surcharge keeps its 1000% limit, a promotion 100%', () => {
    expect(invalidField(promotion({ value: '100.00' }))).toBeUndefined();
    expect(
      invalidField({
        scheduleType: PriceScheduleType.WEEKLY,
        name: 'Вечер',
        valueType: PriceValueType.PERCENT,
        value: '150.00',
        weekdays: [5],
        appliesToAll: true,
      }),
    ).toBeUndefined();
  });

  it('a promotion AMOUNT is not limited to 100', () => {
    expect(
      invalidField(promotion({ valueType: PriceValueType.AMOUNT, value: '150.00' })),
    ).toBeUndefined();
  });
});

describe('promo codes', () => {
  it.each([
    [' autumn ', 'AUTUMN'],
    ['a-b_1', 'A-B_1'],
    ['AB', null],
    ['x'.repeat(33), null],
    ['скидка', null],
  ])('normalizes %s', (value, code) => {
    expect(normalizePromoCode(value)).toBe(code);
  });

  it('generates 8 characters without 0, O, 1 and I', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = randomPromoCode();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      expect(code).not.toMatch(/[01OI]/);
      expect(normalizePromoCode(code)).toBe(code);
    }
  });

  it('draws every character from the alphabet', () => {
    const indexes = [0, 1, 2, 3, 4, 5, 6, PROMO_CODE_ALPHABET.length - 1];
    let call = 0;
    expect(randomPromoCode(() => indexes[call++])).toBe('ABCDEFG9');
  });
});
