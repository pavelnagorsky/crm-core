import { BookingChannel, Prisma } from '@prisma/client';
import {
  productTargetContext,
  serviceTargetContext,
} from '../engine/compile/rule-target-contexts.js';
import { PriceRuleTargetType } from '../engine/enums/price-rule-target-type.enum.js';
import { PriceValueType } from '../engine/enums/price-value-type.enum.js';
import { ProductUnit } from '../engine/enums/product-unit.enum.js';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import {
  promotionRule,
  weekdays,
} from '../engine/testing/pricing-snapshot.factory.js';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleView } from '../interfaces/price-rule-view.interface.js';
import { PromotionMatchItem } from '../interfaces/promotion-match-item.interface.js';
import { PromotionSaleLine } from '../interfaces/promotion-sale-line.interface.js';
import {
  promotionDiscount,
  promotionMatches,
  promotionProductDiscount,
} from './promotion-matches.rules.js';
import { findPromotionOverlaps } from './promotion-overlap.rules.js';
import { promotionSummary } from './promotion-summary.rules.js';

// Monday 23 November 2026.
const TODAY = '2026-11-23';
const scopes = [
  {
    context: serviceTargetContext('cut', 'hair', null),
    title: 'Стрижка',
  },
  {
    context: serviceTargetContext('nails', null, null),
    title: 'Маникюр',
  },
];
const nailsOnly = {
  appliesToAllServices: false,
  targets: [
    { type: PriceRuleTargetType.SERVICE, id: 'nails', excluded: false },
  ],
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
    [
      'another service',
      {
        appliesToAllServices: false,
        targets: [
          { type: PriceRuleTargetType.SERVICE, id: 'cut', excluded: false },
        ],
      },
      {},
    ],
    ['other hours', { intervals: [{ start: 900, end: 960 }] }, {}],
    ['other days', { weekdaysMask: weekdays(6, 7) }, {}],
    ['a disabled one', { enabled: false }, {}],
    ['another channel', {}, { channels: [PromotionChannel.ADMIN] }],
    ['other staff', {}, { staffIds: ['boris'] }],
    ['a period that is over', { visitTo: '2026-11-01' }, {}],
  ] as const)('ignores %s', (_name, overrides, conditions) => {
    const draft = promotionRule(
      'draft',
      {
        ...nailsOnly,
        weekdaysMask: weekdays(1, 2),
        intervals: [{ start: 600, end: 780 }],
      },
      { channels: [PromotionChannel.ONLINE], staffIds: ['anna'] },
    );
    const other = promotionRule(
      'other',
      { ...overrides } as never,
      { ...conditions } as never,
    );
    expect(findPromotionOverlaps(draft, [other], scopes, TODAY)).toEqual([]);
  });

  it('meets on a later day when today does not work, without a time when neither keeps to hours', () => {
    const friday = promotionRule('friday', { weekdaysMask: weekdays(5) });
    const other = promotionRule('other', {});
    expect(
      findPromotionOverlaps(friday, [other], scopes, TODAY)[0].example,
    ).toBe('Все услуги, пт');
  });

  describe('promotions without time conditions', () => {
    // New clients, birthday, promo code: no weekdays and no hours.
    it('name only the common service', () => {
      const birthday = promotionRule('birthday', { ...nailsOnly });
      const code = promotionRule('code', {});
      expect(
        findPromotionOverlaps(birthday, [code], scopes, TODAY)[0].example,
      ).toBe('Маникюр');
    });

    it('say «Все услуги» when both reach every service', () => {
      const birthday = promotionRule('birthday', {});
      const code = promotionRule('code', {});
      expect(
        findPromotionOverlaps(birthday, [code], scopes, TODAY)[0].example,
      ).toBe('Все услуги');
    });

    it('name the first common service when one excludes some', () => {
      const birthday = promotionRule('birthday', {
        targets: [
          { type: PriceRuleTargetType.SERVICE, id: 'cut', excluded: true },
        ],
      });
      const code = promotionRule('code', {});
      expect(
        findPromotionOverlaps(birthday, [code], scopes, TODAY)[0].example,
      ).toBe('Маникюр');
    });
  });

  it('takes the time from inside the common hours when only one keeps to hours', () => {
    const evening = promotionRule('evening', {
      ...nailsOnly,
      intervals: [{ start: 1080, end: 1260 }],
    });
    const code = promotionRule('code', {});
    expect(
      findPromotionOverlaps(code, [evening], scopes, TODAY)[0].example,
    ).toBe('Маникюр, 18:00');
  });
});

describe('promotionMatches', () => {
  const item = (
    over: Partial<PromotionMatchItem> = {},
  ): PromotionMatchItem => ({
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
    {
      ...nailsOnly,
      value: 1500,
      weekdaysMask: weekdays(1),
      intervals: [{ start: 600, end: 720 }],
    },
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
        item({
          bookingId: 'b4',
          visitStartAt: new Date('2026-11-16T09:00:00.000Z'),
        }),
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
    const staffOnly = promotionRule(
      's',
      { ...nailsOnly },
      { staffIds: ['boris'] },
    );
    expect(
      promotionMatches(staffOnly, [item()], targets, 'UTC', 100).bookingsCount,
    ).toBe(0);
  });

  it.each([
    [PriceValueType.PERCENT, 1000, 4990, 100, 590],
    [PriceValueType.AMOUNT, 500, 4990, 100, 590],
    [PriceValueType.AMOUNT, 9000, 4990, 100, 4990],
    [PriceValueType.PERCENT, 1000, 4990, 1, 499],
  ] as const)(
    'discount %s %i of %i, step %i = %i',
    (valueType, value, list, step, discount) => {
      expect(promotionDiscount({ valueType, value }, list, step)).toBe(
        discount,
      );
    },
  );
});

describe('promotionSummary', () => {
  const totals = (revenue: string) => ({
    revenue: new Prisma.Decimal(revenue),
    discount: new Prisma.Decimal(0),
    bookingsCount: 0,
    newClients: 0,
  });
  const products = (revenue: string, discount: string, salesCount: number) => ({
    revenue: new Prisma.Decimal(revenue),
    discount: new Prisma.Decimal(discount),
    salesCount,
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
      products('0', '0', 0),
      products('0', '0', 0),
    );
    expect(summary).toMatchObject({
      activeCount: 1,
      scheduledCount: 2,
      nextStartDate: '2026-12-01',
    });
    expect(summary.previous.revenue.toFixed(2)).toBe('80.00');
  });

  it('adds the product lines net of returns and the separate sales', () => {
    const summary = promotionSummary(
      [],
      totals('100.00'),
      totals('80.00'),
      products('29.97', '3.33', 2),
      products('10.00', '1.00', 1),
    );
    expect(summary.current.revenue.toFixed(2)).toBe('129.97');
    expect(summary.current.discount.toFixed(2)).toBe('3.33');
    expect(summary.current.salesCount).toBe(2);
    expect(summary.previous.revenue.toFixed(2)).toBe('90.00');
  });

  it('no scheduled promotion: no start date', () => {
    expect(
      promotionSummary(
        [],
        totals('0'),
        totals('0'),
        products('0', '0', 0),
        products('0', '0', 0),
      ).nextStartDate,
    ).toBeNull();
  });
});

describe('promotionMatches: separate sales (docs/pricing-stage7-api.md)', () => {
  const line = (over: Partial<PromotionSaleLine> = {}): PromotionSaleLine => ({
    orderId: 'o1',
    productId: 'shampoo',
    productCategoryId: 'care',
    unit: ProductUnit.PIECE,
    quantity: new Prisma.Decimal('2'),
    listUnitPrice: new Prisma.Decimal('20.00'),
    sellerStaffId: 'anna',
    // Monday 10:00 in Minsk (UTC+3).
    confirmedAt: new Date('2026-11-16T07:00:00.000Z'),
    ...over,
  });
  const careProducts = {
    appliesToAllServices: false,
    targets: [
      {
        type: PriceRuleTargetType.PRODUCT_CATEGORY,
        id: 'care',
        excluded: false,
      },
    ],
  };

  it('counts sales whose lines match by product, sale moment, ADMIN channel and seller', () => {
    const draft = promotionRule(
      'draft',
      { ...careProducts, value: 1000, weekdaysMask: weekdays(1) },
      { channels: [PromotionChannel.ADMIN] },
    );
    const matches = promotionMatches(
      draft,
      [],
      new Map(),
      'Europe/Minsk',
      1,
      [
        line(),
        line({ productId: 'mask' }),
        line({ orderId: 'o2', productCategoryId: 'other' }),
        // Tuesday: outside the weekdays.
        line({ orderId: 'o3', confirmedAt: new Date('2026-11-17T07:00:00.000Z') }),
      ],
    );
    // 2 x 20.00 = 40.00, -10% = 4.00 per line, two lines of o1.
    expect(matches).toEqual({
      bookingsCount: 0,
      salesCount: 1,
      discount: new Prisma.Decimal('8.00'),
    });
  });

  it('an online-only promotion matches no sale', () => {
    const draft = promotionRule('draft', { ...careProducts }, {
      channels: [PromotionChannel.ONLINE],
    });
    expect(
      promotionMatches(draft, [], new Map(), 'UTC', 1, [line()]).salesCount,
    ).toBe(0);
  });

  it('a staff condition needs the seller; a line without a seller does not match', () => {
    const draft = promotionRule('draft', { ...careProducts }, {
      channels: [PromotionChannel.ADMIN],
      staffIds: ['anna'],
    });
    expect(
      promotionMatches(draft, [], new Map(), 'UTC', 1, [
        line({ sellerStaffId: null }),
        line({ orderId: 'o2', sellerStaffId: 'boris' }),
      ]).salesCount,
    ).toBe(0);
  });

  it('"all services" does not reach products', () => {
    const draft = promotionRule('draft', {}, {
      channels: [PromotionChannel.ADMIN],
    });
    expect(
      promotionMatches(draft, [], new Map(), 'UTC', 1, [line()]).salesCount,
    ).toBe(0);
  });

  it.each([
    // AMOUNT per piece: 3 pcs x 5.00 off 3 x 20.00.
    [PriceValueType.AMOUNT, 500, ProductUnit.PIECE, '3', '20.00', 1, 1500],
    // AMOUNT once on a weighed line: 0.5 kg of 40.00 = 20.00, 5.00 off once.
    [PriceValueType.AMOUNT, 500, ProductUnit.KILOGRAM, '0.5', '40.00', 1, 500],
    // PERCENT on the line: 3 x 4.99 = 14.97, -10% = 13.473 -> 13.47, step 1.00 -> 13.00.
    [PriceValueType.PERCENT, 1000, ProductUnit.PIECE, '3', '4.99', 100, 197],
    // Never below 0.
    [PriceValueType.AMOUNT, 9000, ProductUnit.PIECE, '1', '20.00', 1, 2000],
  ] as const)(
    'product discount %s %i on %s x%s of %s, step %i = %i',
    (valueType, value, unit, quantity, price, step, discount) => {
      expect(
        promotionProductDiscount(
          { valueType, value },
          {
            unit,
            quantity: new Prisma.Decimal(quantity),
            listUnitPrice: new Prisma.Decimal(price),
          },
          step,
        ),
      ).toBe(discount);
    },
  );
});

describe('findPromotionOverlaps: products', () => {
  const productScopes = [
    ...scopes,
    {
      context: productTargetContext('shampoo', 'care'),
      title: 'Шампунь X',
    },
  ];

  it('meets on a common product; «Все товары» when both reach every product', () => {
    const onlyShampoo = promotionRule('a', {
      appliesToAllServices: false,
      targets: [
        { type: PriceRuleTargetType.PRODUCT, id: 'shampoo', excluded: false },
      ],
    });
    const allProducts = promotionRule('b', {
      appliesToAllServices: false,
      appliesToAllProducts: true,
    });
    const allProductsToo = promotionRule('c', {
      appliesToAllServices: false,
      appliesToAllProducts: true,
    });
    expect(
      findPromotionOverlaps(onlyShampoo, [allProducts], productScopes, TODAY)[0]
        .example,
    ).toBe('Шампунь X');
    expect(
      findPromotionOverlaps(allProducts, [allProductsToo], productScopes, TODAY)[0]
        .example,
    ).toBe('Все товары');
  });

  it('a promotion on services and one on products do not meet', () => {
    const services = promotionRule('a', {});
    const allProducts = promotionRule('b', {
      appliesToAllServices: false,
      appliesToAllProducts: true,
    });
    expect(
      findPromotionOverlaps(services, [allProducts], productScopes, TODAY),
    ).toEqual([]);
  });
});
