import {
  PriceValueType,
  PromotionChannel,
  PromotionClientFilter,
  PromotionLimitPeriod,
} from '@prisma/client';
import { PromotionConditionsInput } from '../interfaces/promotion-conditions-input.interface.js';
import {
  buildPromotionConditions,
  durationText,
  PROMOTION_ONE_DISCOUNT_LINE,
} from './promotion-conditions.rules.js';
import { weekdaysToMask } from './price-rule-input.rules.js';

const base: PromotionConditionsInput = {
  valueType: PriceValueType.PERCENT,
  value: '10.00',
  currency: 'BYN',
  appliesToAll: true,
  targets: [],
  weekdaysMask: 0,
  intervals: [],
  visitFrom: null,
  visitTo: null,
  bookingFrom: null,
  bookingTo: null,
  minLeadMinutes: null,
  maxLeadMinutes: null,
  clientFilter: PromotionClientFilter.ANY,
  birthdayWindowDays: null,
  staffNames: [],
  channels: [PromotionChannel.ONLINE, PromotionChannel.ADMIN],
  minVisitTotal: null,
  usageLimitTotal: null,
  usageLimitPerClient: null,
  usageLimitPeriod: null,
  usageCount: null,
};

const target = (name: string | null, excluded = false) => ({ name, excluded });

describe('buildPromotionConditions (docs/pricing-stage4-api.md, «Условия»)', () => {
  it('no restrictions: the size and the one-discount line', () => {
    expect(buildPromotionConditions(base)).toEqual([
      '−10% на все услуги',
      PROMOTION_ONE_DISCOUNT_LINE,
    ]);
  });

  it.each([
    ['excluded target', { value: '15.00', targets: [target('Окрашивание', true)] }, '−15% на все услуги, кроме: Окрашивание'],
    [
      'amount on two services',
      {
        valueType: PriceValueType.AMOUNT,
        value: '15.00',
        appliesToAll: false,
        targets: [target('Маникюр'), target('Педикюр')],
      },
      '−15 BYN на Маникюр и Педикюр',
    ],
    [
      'more than three targets',
      {
        appliesToAll: false,
        targets: ['A', 'B', 'C', 'D', 'E'].map((name) => target(name)),
      },
      '−10% на A, B, C и ещё 2',
    ],
    ['fraction percent', { value: '12.50' }, '−12,5% на все услуги'],
    [
      'a deleted target is left out',
      { appliesToAll: false, targets: [target(null), target('Стрижка')] },
      '−10% на Стрижка',
    ],
  ] as const)('size: %s', (_name, overrides, line) => {
    expect(buildPromotionConditions({ ...base, ...overrides } as PromotionConditionsInput)[0]).toBe(line);
  });

  it.each([
    ['Mon-Thu with an interval', weekdaysToMask([1, 2, 3, 4]), [[600, 780]], 'Пн-Чт, начало визита с 10:00 до 13:00'],
    ['every day with an interval', 0, [[600, 780]], 'Каждый день, начало визита с 10:00 до 13:00'],
    ['separate days', weekdaysToMask([1, 3, 5]), [], 'Пн, Ср, Пт'],
    ['two adjacent days are listed', weekdaysToMask([6, 7]), [], 'Сб, Вс'],
    ['mixed', weekdaysToMask([1, 2, 3, 5]), [], 'Пн-Ср, Пт'],
    [
      'two intervals',
      weekdaysToMask([1, 2, 3, 4, 5]),
      [
        [600, 720],
        [1020, 1440],
      ],
      'Пн-Пт, начало визита с 10:00 до 12:00 и с 17:00 до 24:00',
    ],
  ] as const)('when: %s', (_name, mask, intervals, line) => {
    const lines = buildPromotionConditions({
      ...base,
      weekdaysMask: mask,
      intervals: intervals.map(([startMinute, endMinute]) => ({ startMinute, endMinute })),
    });
    expect(lines[1]).toBe(line);
  });

  it('every day of the week without intervals is not written', () => {
    expect(buildPromotionConditions({ ...base, weekdaysMask: 127 })).toHaveLength(2);
  });

  it.each([
    ['from only', '2026-10-01', null, 'С 1 октября 2026, без даты окончания'],
    ['to only', null, '2026-12-31', 'До 31 декабря 2026'],
    ['one month', '2026-12-01', '2026-12-31', '1-31 декабря 2026'],
    ['two months', '2026-11-01', '2026-12-31', '1 ноября - 31 декабря 2026'],
    ['two years', '2026-12-01', '2027-01-10', '1 декабря 2026 - 10 января 2027'],
    ['one day', '2026-12-31', '2026-12-31', '31 декабря 2026'],
  ] as const)('visit dates: %s', (_name, visitFrom, visitTo, line) => {
    expect(buildPromotionConditions({ ...base, visitFrom, visitTo })[1]).toBe(line);
  });

  it.each([
    ['last-minute', { maxLeadMinutes: 180 }, ['Запись не позже чем за 3 часа до визита']],
    ['in advance', { minLeadMinutes: 10080 }, ['Запись не раньше чем за 7 дней до визита']],
    [
      'booking period',
      { bookingFrom: '2026-11-01', bookingTo: '2026-11-30' },
      ['Запись с 1 по 30 ноября'],
    ],
    [
      'booking period over two months',
      { bookingFrom: '2026-11-20', bookingTo: '2026-12-05' },
      ['Запись с 20 ноября по 5 декабря'],
    ],
    ['booking until', { bookingTo: '2026-11-30' }, ['Запись до 30 ноября']],
    ['new clients', { clientFilter: PromotionClientFilter.NEW }, ['Для новых клиентов']],
    [
      'birthday',
      { clientFilter: PromotionClientFilter.BIRTHDAY, birthdayWindowDays: 7 },
      ['В течение 7 дней до и после дня рождения'],
    ],
    [
      'birthday, one day',
      { clientFilter: PromotionClientFilter.BIRTHDAY, birthdayWindowDays: 1 },
      ['В течение 1 дня до и после дня рождения'],
    ],
    [
      'birthday, the day itself',
      { clientFilter: PromotionClientFilter.BIRTHDAY, birthdayWindowDays: 0 },
      ['В день рождения'],
    ],
    ['staff', { staffNames: ['Елена Соколова'] }, ['У мастеров: Елена Соколова']],
    ['online only', { channels: [PromotionChannel.ONLINE] }, ['Только онлайн-запись']],
    ['admin only', { channels: [PromotionChannel.ADMIN] }, ['Только у администратора']],
    ['minimum total', { minVisitTotal: '40.00' }, ['Визит от 40 BYN']],
    [
      'once per client',
      { usageLimitPerClient: 1, usageLimitPeriod: PromotionLimitPeriod.ALL_TIME },
      ['1 раз на клиента'],
    ],
    [
      'once a year',
      { usageLimitPerClient: 1, usageLimitPeriod: PromotionLimitPeriod.YEAR },
      ['1 раз в год на клиента'],
    ],
    [
      'twice a month',
      { usageLimitPerClient: 2, usageLimitPeriod: PromotionLimitPeriod.MONTH },
      ['2 раза в месяц на клиента'],
    ],
    ['remaining', { usageLimitTotal: 100, usageCount: 34 }, ['Осталось 66 из 100']],
    ['remaining, used up', { usageLimitTotal: 100, usageCount: 120 }, ['Осталось 0 из 100']],
    ['total limit without a count is left out', { usageLimitTotal: 100 }, []],
  ] as const)('%s', (_name, overrides, lines) => {
    expect(buildPromotionConditions({ ...base, ...overrides } as PromotionConditionsInput)).toEqual([
      '−10% на все услуги',
      ...lines,
      PROMOTION_ONE_DISCOUNT_LINE,
    ]);
  });

  it('keeps the order of the contract and never uses an em dash', () => {
    const lines = buildPromotionConditions({
      ...base,
      weekdaysMask: weekdaysToMask([1, 2, 3, 4]),
      intervals: [{ startMinute: 600, endMinute: 780 }],
      visitFrom: '2026-12-01',
      visitTo: '2026-12-31',
      maxLeadMinutes: 180,
      bookingTo: '2026-11-30',
      clientFilter: PromotionClientFilter.NEW,
      staffNames: ['Анна'],
      channels: [PromotionChannel.ONLINE],
      minVisitTotal: '40.50',
      usageLimitPerClient: 1,
      usageLimitPeriod: PromotionLimitPeriod.ALL_TIME,
      usageLimitTotal: 100,
      usageCount: 34,
    });
    expect(lines).toEqual([
      '−10% на все услуги',
      'Пн-Чт, начало визита с 10:00 до 13:00',
      '1-31 декабря 2026',
      'Запись не позже чем за 3 часа до визита',
      'Запись до 30 ноября',
      'Для новых клиентов',
      'У мастеров: Анна',
      'Только онлайн-запись',
      'Визит от 40,5 BYN',
      '1 раз на клиента',
      'Осталось 66 из 100',
      PROMOTION_ONE_DISCOUNT_LINE,
    ]);
    expect(lines.join('\n')).not.toContain(String.fromCharCode(0x2014));
  });

  it.each([
    [30, '30 минут'],
    [1, '1 минута'],
    [90, '90 минут'],
    [60, '1 час'],
    [120, '2 часа'],
    [300, '5 часов'],
    [1440, '1 день'],
    [2880, '2 дня'],
    [30240, '21 день'],
  ])('duration %i minutes = %s', (minutes, text) => {
    expect(durationText(minutes)).toBe(text);
  });
});
