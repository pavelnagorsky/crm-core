import { PriceRuleKind, PriceValueType, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceAnalyticsItemType } from '../enums/price-analytics-item-type.enum.js';
import { PriceAnalyticsSource } from '../enums/price-analytics-source.enum.js';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';
import { PriceAnalyticsChange } from '../interfaces/price-analytics-change.interface.js';
import { PriceAnalyticsItem } from '../interfaces/price-analytics-item.interface.js';
import { PriceAnalyticsRuleInfo } from '../interfaces/price-analytics-rule-info.interface.js';
import { priceAnalyticsXlsxRows } from './price-analytics-export.rules.js';
import {
  priceAnalyticsChangesText,
  priceAnalyticsGroupCounts,
  priceAnalyticsListItems,
  priceAnalyticsReasonRows,
  priceAnalyticsRuleIds,
  priceAnalyticsStaffRows,
  priceAnalyticsTotals,
  withRuleNames,
} from './price-analytics-report.rules.js';

const d = (value: string | number) => new Prisma.Decimal(value);

const change = (
  reason: PriceChangeReason,
  amount: string,
  extra: Partial<PriceAnalyticsChange> = {},
): PriceAnalyticsChange => ({
  reason,
  ruleId: null,
  name: reason,
  valueType: null,
  value: null,
  amount: d(amount),
  ...extra,
});

const service = (
  id: string,
  overrides: Partial<PriceAnalyticsItem> = {},
): PriceAnalyticsItem => ({
  id,
  itemType: PriceAnalyticsItemType.SERVICE,
  source: PriceAnalyticsSource.BOOKING,
  bookingId: `booking-${id}`,
  orderId: null,
  at: new Date('2026-11-10T10:00:00Z'),
  title: 'Стрижка',
  quantity: null,
  clientId: 'client-1',
  clientName: 'Мария',
  staffId: 'staff-1',
  staffName: 'Анна (тогда)',
  returned: false,
  regular: d('40'),
  surcharges: d('0'),
  discounts: d('0'),
  received: d('40'),
  changes: [],
  ...overrides,
});

const product = (
  id: string,
  overrides: Partial<PriceAnalyticsItem> = {},
): PriceAnalyticsItem =>
  service(id, {
    itemType: PriceAnalyticsItemType.PRODUCT,
    source: PriceAnalyticsSource.SALE,
    bookingId: null,
    orderId: `order-${id}`,
    title: 'Шампунь',
    quantity: d('2'),
    staffId: null,
    staffName: null,
    ...overrides,
  });

const rule = (
  id: string,
  name: string,
  kind: PriceRuleKind = PriceRuleKind.PROMOTION,
): PriceAnalyticsRuleInfo => ({
  id,
  name,
  kind,
  scenario: null,
  valueType: PriceValueType.PERCENT,
  value: d('15'),
  promoCode: null,
  archived: false,
});

const promo = (amount: string, ruleId: string | null = 'autumn', name = 'Осень (было)') =>
  change(PriceChangeReason.PROMOTION, amount, {
    ruleId,
    name,
    valueType: PriceValueType.PERCENT,
    value: d('15'),
  });
const weekend = (amount: string) =>
  change(PriceChangeReason.SURCHARGE, amount, {
    ruleId: 'weekend',
    name: 'Выходные',
    valueType: PriceValueType.PERCENT,
    value: d('15'),
  });

// Two visits of one client and a separate sale without a client.
const items = (): PriceAnalyticsItem[] => [
  service('1', {
    bookingId: 'b1',
    regular: d('40'),
    surcharges: d('6'),
    discounts: d('6.9'),
    received: d('39.1'),
    changes: [weekend('6'), promo('6.9')],
  }),
  service('2', {
    bookingId: 'b1',
    staffId: 'staff-2',
    regular: d('30'),
    discounts: d('10'),
    received: d('20'),
    changes: [change(PriceChangeReason.CUSTOM_PRICE_DOWN, '10')],
  }),
  service('3', { bookingId: 'b2', at: new Date('2026-11-12T10:00:00Z') }),
  product('4', {
    clientId: null,
    clientName: null,
    regular: d('20'),
    discounts: d('2'),
    received: d('18'),
    changes: [promo('2', null, 'Удалённая')],
    at: new Date('2026-11-11T10:00:00Z'),
  }),
];

const rules = new Map([
  ['autumn', rule('autumn', 'Осень')],
  ['weekend', rule('weekend', 'Выходные', PriceRuleKind.SURCHARGE)],
]);

describe('priceAnalyticsTotals', () => {
  it('sums the amounts and counts bookings, separate sales and clients', () => {
    const totals = priceAnalyticsTotals(items());
    expect({
      regular: MoneyUtils.format(totals.regular),
      surcharges: MoneyUtils.format(totals.surcharges),
      discounts: MoneyUtils.format(totals.discounts),
      received: MoneyUtils.format(totals.received),
      listTotal: MoneyUtils.format(totals.listTotal),
    }).toEqual({
      regular: '130.00',
      surcharges: '6.00',
      discounts: '18.90',
      received: '117.10',
      listTotal: '136.00',
    });
    expect(totals).toMatchObject({
      itemsCount: 4,
      bookingsCount: 2,
      salesCount: 1,
      clientsCount: 1,
    });
  });

  it('is zero for an empty period', () => {
    expect(priceAnalyticsTotals([])).toMatchObject({
      itemsCount: 0,
      bookingsCount: 0,
      salesCount: 0,
      clientsCount: 0,
    });
    expect(priceAnalyticsTotals([]).received.isZero()).toBe(true);
  });

  it('counts a visit product to its booking, not to the sales', () => {
    const totals = priceAnalyticsTotals([
      service('1', { bookingId: 'b1' }),
      product('2', {
        source: PriceAnalyticsSource.BOOKING,
        bookingId: 'b1',
        orderId: 'o1',
      }),
    ]);
    expect(totals).toMatchObject({ bookingsCount: 1, salesCount: 0 });
  });
});

describe('priceAnalyticsGroupCounts', () => {
  it('counts distinct items, bookings, sales and clients per group', () => {
    // item 1 has a surcharge and a discount: it is in both groups; item 3 has no change.
    expect(priceAnalyticsGroupCounts(items())).toEqual({
      discountsCounts: {
        itemsCount: 3,
        bookingsCount: 1,
        salesCount: 1,
        clientsCount: 1,
      },
      surchargesCounts: {
        itemsCount: 1,
        bookingsCount: 1,
        salesCount: 0,
        clientsCount: 1,
      },
    });
  });

  it('counts a booking and a client once over several items, a visit product to its booking', () => {
    const { discountsCounts } = priceAnalyticsGroupCounts([
      service('1', { bookingId: 'b1', changes: [promo('2')] }),
      service('2', { bookingId: 'b1', changes: [promo('3')] }),
      product('3', {
        source: PriceAnalyticsSource.BOOKING,
        bookingId: 'b1',
        orderId: 'o1',
        changes: [promo('1')],
      }),
      product('4', { clientId: null, changes: [promo('1')] }),
    ]);
    expect(discountsCounts).toEqual({
      itemsCount: 4,
      bookingsCount: 1,
      salesCount: 1,
      clientsCount: 1,
    });
  });

  it('is zero without items', () => {
    const zero = { itemsCount: 0, bookingsCount: 0, salesCount: 0, clientsCount: 0 };
    expect(priceAnalyticsGroupCounts([])).toEqual({
      discountsCounts: zero,
      surchargesCounts: zero,
    });
  });
});

describe('priceAnalyticsReasonRows', () => {
  it('builds a row per rule and per other reason, with shares and counts', () => {
    const { discounts, surcharges } = priceAnalyticsReasonRows(items(), rules);
    expect(
      discounts.map((row) => [
        row.reason,
        row.rule?.id ?? null,
        row.name,
        MoneyUtils.format(row.amount),
        row.sharePct,
        row.bookingsCount,
        row.salesCount,
        row.clientsCount,
        row.itemsCount,
      ]),
    ).toEqual([
      [PriceChangeReason.CUSTOM_PRICE_DOWN, null, null, '10.00', 52.9, 1, 0, 1, 1],
      [PriceChangeReason.PROMOTION, 'autumn', 'Осень', '6.90', 36.5, 1, 0, 1, 1],
      [PriceChangeReason.PROMOTION, null, 'Удалённая', '2.00', 10.6, 0, 1, 0, 1],
    ]);
    expect(
      surcharges.map((row) => [row.reason, row.rule?.kind, MoneyUtils.format(row.amount), row.sharePct]),
    ).toEqual([[PriceChangeReason.SURCHARGE, PriceRuleKind.SURCHARGE, '6.00', 100]]);
  });

  it('sums one rule over items and leaves out zero rows', () => {
    const { discounts } = priceAnalyticsReasonRows(
      [
        service('1', { changes: [promo('3')] }),
        service('2', { bookingId: 'b9', clientId: 'client-2', changes: [promo('4')] }),
        service('3', { changes: [promo('0')] }),
        service('4', { changes: [change(PriceChangeReason.CLIENT_DISCOUNT, '0')] }),
      ],
      rules,
    );
    expect(discounts).toHaveLength(1);
    expect(discounts[0]).toMatchObject({
      name: 'Осень',
      itemsCount: 3,
      bookingsCount: 3,
      clientsCount: 2,
      sharePct: 100,
    });
    expect(MoneyUtils.format(discounts[0].amount)).toBe('7.00');
  });

  it('orders equal amounts by name', () => {
    const { discounts } = priceAnalyticsReasonRows(
      [
        service('1', { changes: [promo('5', 'b', 'Бета')] }),
        service('2', { changes: [promo('5', 'a', 'Альфа')] }),
      ],
      new Map(),
    );
    expect(discounts.map((row) => row.name)).toEqual(['Альфа', 'Бета']);
    expect(discounts.every((row) => row.rule === null)).toBe(true);
  });
});

describe('priceAnalyticsStaffRows', () => {
  it('groups by staff member with current names, the none row and custom discounts', () => {
    const rows = priceAnalyticsStaffRows(
      items(),
      new Map([['staff-1', { name: 'Анна', avatarUrl: 'https://a' }]]),
    );
    expect(
      rows.map((row) => [
        row.staffId,
        row.name,
        row.avatarUrl,
        row.bookingsCount,
        row.salesCount,
        MoneyUtils.format(row.discounts),
        MoneyUtils.format(row.customDiscounts),
        MoneyUtils.format(row.received),
      ]),
    ).toEqual([
      ['staff-1', 'Анна', 'https://a', 2, 0, '6.90', '0.00', '79.10'],
      ['staff-2', 'Анна (тогда)', null, 1, 0, '10.00', '10.00', '20.00'],
      [null, null, null, 0, 1, '2.00', '0.00', '18.00'],
    ]);
  });

  it('leaves out a staff member with nothing', () => {
    const rows = priceAnalyticsStaffRows(
      [service('1', { regular: d(0), received: d(0) })],
      new Map(),
    );
    expect(rows).toEqual([]);
  });
});

describe('priceAnalyticsListItems', () => {
  it('keeps the changed items newest first, then by id', () => {
    const list = priceAnalyticsListItems(
      [...items(), service('0', { changes: [weekend('1')] })],
      {},
    );
    expect(list.map((item) => item.id)).toEqual(['4', '0', '1', '2']);
  });

  it('filters by reason and by rule', () => {
    expect(
      priceAnalyticsListItems(items(), { reason: PriceChangeReason.PROMOTION }).map(
        (item) => item.id,
      ),
    ).toEqual(['4', '1']);
    expect(
      priceAnalyticsListItems(items(), {
        reason: PriceChangeReason.PROMOTION,
        ruleId: 'autumn',
      }).map((item) => item.id),
    ).toEqual(['1']);
    expect(
      priceAnalyticsListItems(items(), {
        reason: PriceChangeReason.CUSTOM_PRICE_DOWN,
      }).map((item) => item.id),
    ).toEqual(['2']);
  });
});

describe('rule names', () => {
  it('collects rule ids and puts the current names on the changes', () => {
    expect(priceAnalyticsRuleIds(items()).sort()).toEqual(['autumn', 'weekend']);
    const [first, , , sale] = withRuleNames(items(), rules);
    expect(first.changes.map((entry) => entry.name)).toEqual(['Выходные', 'Осень']);
    expect(sale.changes[0].name).toBe('Удалённая');
  });
});

describe('export', () => {
  it('writes the changes as text with signs, percents and money with a comma', () => {
    expect(
      priceAnalyticsChangesText([
        weekend('6'),
        promo('6.9', 'autumn', 'Осенний промокод'),
        change(PriceChangeReason.CUSTOM_PRICE_DOWN, '1.5', { name: 'Своя цена' }),
        change(PriceChangeReason.SURCHARGE, '5', {
          name: 'Праздник',
          valueType: PriceValueType.AMOUNT,
          value: d('5'),
        }),
        change(PriceChangeReason.CLIENT_DISCOUNT, '0.4', {
          name: 'Скидка клиента',
          valueType: PriceValueType.PERCENT,
          value: d('12.5'),
        }),
      ]),
    ).toBe(
      'Выходные +15% +6,00; Осенний промокод −15% −6,90; Своя цена −1,50; Праздник +5,00 +5,00; Скидка клиента −12,5% −0,40',
    );
  });

  it('writes rows in the location zone and a total row', () => {
    const list = items();
    const rows = priceAnalyticsXlsxRows({
      items: list,
      totals: priceAnalyticsTotals(list),
      timezone: 'Europe/Minsk',
      fromDay: '2026-11-01',
      toDay: '2026-11-30',
    });
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      date: '10.11.2026',
      time: '13:00',
      source: 'Запись',
      client: 'Мария',
      staff: 'Анна (тогда)',
      title: 'Стрижка',
      itemType: 'Услуга',
      quantity: '',
      regular: 40,
      surcharges: 6,
      discounts: 6.9,
      received: 39.1,
      changes: 'Выходные +15% +6,00; Осень (было) −15% −6,90',
    });
    expect(rows[3]).toMatchObject({
      source: 'Продажа',
      client: '',
      staff: '',
      itemType: 'Товар',
      quantity: 2,
    });
    expect(rows[4]).toMatchObject({
      date: 'Итого',
      regular: 130,
      surcharges: 6,
      discounts: 18.9,
      received: 117.1,
    });
  });
});
