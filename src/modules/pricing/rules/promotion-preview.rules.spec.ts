import { BookingChannel, Prisma } from '@prisma/client';
import { PriceRuleTargetType } from '../engine/enums/price-rule-target-type.enum.js';
import { PriceValueType } from '../engine/enums/price-value-type.enum.js';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import {
  promotionRule,
  weekdays,
} from '../engine/testing/pricing-snapshot.factory.js';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleView } from '../interfaces/price-rule-view.interface.js';
import { PromotionMatchItem } from '../interfaces/promotion-match-item.interface.js';
import { promotionDiscount, promotionMatches } from './promotion-matches.rules.js';
import { findPromotionOverlaps } from './promotion-overlap.rules.js';
import { promotionSummary } from './promotion-summary.rules.js';

// Monday 23 November 2026.
const TODAY = '2026-11-23';
const scopes = [
  {
    context: { serviceId: 'cut', categoryId: 'hair', bundleId: null },
    title: 'Стрижка',
  },
  {
    context: { serviceId: 'nails', categoryId: null, bundleId: null },
    title: 'Маникюр',
  },
];
const nailsOnly = {
  appliesToAll: false,
  targets: [{ type: PriceRuleTargetType.SERVICE, id: 'nails', excluded: false }],
};

describe('findPromotionOverlaps', () => {
  const morning = promotionRule('morning', {
    ...nailsOnly,
    weekdaysMask: weekdays(1, 2),
    intervals: [{ start: 600, end: 780 }],
  });

  it('finds a promotion on the same service, channel and time, with an example', () => {
    const other = promotionRule('other', {
      name: 'Все услуги',
      value: 1500,
      intervals: [{ start: 720, end: 900 }],
    });
    expect(findPromotionOverlaps(morning, [other], scopes, TODAY)).toEqual([
      {
        ruleId: 'other',
        name: 'Все услуги',
        publicName: 'Акция other',
        valueType: 'PERCENT',
        value: new Prisma.Decimal(15),
        example: 'Маникюр, пн 12:00',
      },
    ]);
  });

  it.each([
    ['another service', { appliesToAll: false, targets: [{ type: PriceRuleTargetType.SERVICE, id: 'cut', excluded: false }] }, {}],
    ['other hours', { intervals: [{ start: 900, end: 960 }] }, {}],
    ['other days', { weekdaysMask: weekdays(6, 7) }, {}],
    ['a disabled one', { enabled: false }, {}],
    ['another channel', {}, { channels: [PromotionChannel.ADMIN] }],
    ['other staff', {}, { staffIds: ['boris'] }],
    ['a period that is over', { visitTo: '2026-11-01' }, {}],
  ] as const)('ignores %s', (_name, overrides, conditions) => {
    const draft = promotionRule(
      'draft',
      { ...nailsOnly, weekdaysMask: weekdays(1, 2), intervals: [{ start: 600, end: 780 }] },
      { channels: [PromotionChannel.ONLINE], staffIds: ['anna'] },
    );
    const other = promotionRule('other', { ...overrides } as never, { ...conditions } as never);
    expect(findPromotionOverlaps(draft, [other], scopes, TODAY)).toEqual([]);
  });

  it('meets on a later day when today does not work', () => {
    const friday = promotionRule('friday', { weekdaysMask: weekdays(5) });
    const other = promotionRule('other', {});
    expect(findPromotionOverlaps(friday, [other], scopes, TODAY)[0].example).toBe(
      'Стрижка, пт 00:00',
    );
  });
});

describe('promotionMatches', () => {
  const item = (over: Partial<PromotionMatchItem> = {}): PromotionMatchItem => ({
    bookingId: 'b1',
    serviceId: 'nails',
    staffId: 'anna',
    bundleId: null,
    // 10:00 in Minsk (UTC+3).
    visitStartAt: new Date('2026-11-16T07:00:00.000Z'),
    channel: BookingChannel.WIDGET,
    listPrice: new Prisma.Decimal('43.00'),
    ...over,
  });
  const targets = new Map([
    ['nails', { serviceId: 'nails', categoryId: null, bundleId: null }],
    ['cut', { serviceId: 'cut', categoryId: 'hair', bundleId: null }],
  ]);
  const draft = promotionRule(
    'draft',
    { ...nailsOnly, value: 1500, weekdaysMask: weekdays(1), intervals: [{ start: 600, end: 720 }] },
    { channels: [PromotionChannel.ONLINE] },
  );

  it('counts bookings by schedule in the location zone, service and channel; discount rounded down', () => {
    const matches = promotionMatches(
      draft,
      [
        item(),
        item({ bookingId: 'b1', staffId: 'boris' }),
        item({ bookingId: 'b2', serviceId: 'cut' }),
        item({ bookingId: 'b3', channel: BookingChannel.MANUAL }),
        // 12:00 Minsk: outside the interval.
        item({ bookingId: 'b4', visitStartAt: new Date('2026-11-16T09:00:00.000Z') }),
      ],
      targets,
      'Europe/Minsk',
      100,
    );
    // 43.00 - 15% = 36.55 -> 36.00: 7.00 each, two items of b1.
    expect(matches.bookingsCount).toBe(1);
    expect(matches.discount.toFixed(2)).toBe('14.00');
  });

  it('honours staff limits', () => {
    const staffOnly = promotionRule('s', { ...nailsOnly }, { staffIds: ['boris'] });
    expect(
      promotionMatches(staffOnly, [item()], targets, 'UTC', 100).bookingsCount,
    ).toBe(0);
  });

  it.each([
    [PriceValueType.PERCENT, 1000, 4990, 100, 590],
    [PriceValueType.AMOUNT, 500, 4990, 100, 590],
    [PriceValueType.AMOUNT, 9000, 4990, 100, 4990],
    [PriceValueType.PERCENT, 1000, 4990, 1, 499],
  ] as const)('discount %s %i of %i, step %i = %i', (valueType, value, list, step, discount) => {
    expect(promotionDiscount({ valueType, value }, list, step)).toBe(discount);
  });
});

describe('promotionSummary', () => {
  const totals = (revenue: string) => ({
    revenue: new Prisma.Decimal(revenue),
    discount: new Prisma.Decimal(0),
    bookingsCount: 0,
    newClients: 0,
  });
  const view = (status: PriceRuleStatus, nextDate: string | null) =>
    ({ status, nextDate }) as PriceRuleView;

  it('counts active and scheduled promotions and the nearest start', () => {
    const summary = promotionSummary(
      [
        view(PriceRuleStatus.ACTIVE, TODAY),
        view(PriceRuleStatus.SCHEDULED, '2026-12-10'),
        view(PriceRuleStatus.SCHEDULED, '2026-12-01'),
        view(PriceRuleStatus.DISABLED, null),
        view(PriceRuleStatus.ENDED, null),
      ],
      totals('100.00'),
      totals('80.00'),
    );
    expect(summary).toMatchObject({
      activeCount: 1,
      scheduledCount: 2,
      nextStartDate: '2026-12-01',
    });
    expect(summary.previous.revenue.toFixed(2)).toBe('80.00');
  });

  it('no scheduled promotion: no start date', () => {
    expect(promotionSummary([], totals('0'), totals('0')).nextStartDate).toBeNull();
  });
});
