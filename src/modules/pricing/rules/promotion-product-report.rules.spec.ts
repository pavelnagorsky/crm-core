import { Prisma } from '@prisma/client';
import { PromotionProductLine } from '../interfaces/promotion-product-line.interface.js';
import { PromotionReport } from '../interfaces/promotion-report.interface.js';
import {
  mergePromotionReport,
  promotionProductReport,
  promotionProductStats,
  promotionProductStatsByRule,
} from './promotion-product-report.rules.js';

const d = (value: string) => new Prisma.Decimal(value);

const line = (over: Partial<PromotionProductLine> = {}): PromotionProductLine => ({
  orderItemId: 'i1',
  orderId: 'o1',
  ruleIds: ['promo'],
  bookingId: null,
  clientId: 'c1',
  productId: 'shampoo',
  title: 'Шампунь',
  // 3 pcs x 10.00 with 10.00 off the line.
  quantity: d('3'),
  lineTotal: d('20.00'),
  discountTotal: d('10.00'),
  sellerStaffId: 'anna',
  sellerName: 'Anna (line)',
  returnedQuantity: d('0'),
  returnedTotal: d('0'),
  returnedDiscount: d('0'),
  ...over,
});

const visits = (over: Partial<PromotionReport> = {}): PromotionReport => ({
  revenue: d('100.00'),
  discount: d('15.00'),
  bookingsCount: 2,
  clientsCount: 2,
  newClients: 1,
  returningClients: 1,
  avgDiscount: d('7.50'),
  returnedRate: null,
  staff: [
    {
      staffId: 'boris',
      name: 'Boris',
      avatarUrl: null,
      bookingsCount: 2,
      revenue: d('100.00'),
      discount: d('15.00'),
    },
  ],
  notReturned: { count: 0, items: [] },
  ...over,
});

describe('Promotion report: products (docs/pricing-stage7-api.md, «Страница акции»)', () => {
  it('totals are net of returns; only separate sales count as sales', () => {
    const stats = promotionProductStats([
      // One of three returned: 6.67 back, 3.33 of the discount.
      line({
        returnedQuantity: d('1'),
        returnedTotal: d('6.67'),
        returnedDiscount: d('3.33'),
      }),
      line({ orderItemId: 'i2', orderId: 'o1', productId: 'mask' }),
      // A product of a booking: revenue counts, not a sale.
      line({ orderItemId: 'i3', orderId: 'o2', bookingId: 'b1' }),
      line({ orderItemId: 'i4', orderId: 'o3' }),
    ]);
    expect(stats.revenue.toFixed(2)).toBe('73.33');
    expect(stats.discount.toFixed(2)).toBe('36.67');
    expect(stats.salesCount).toBe(2);
  });

  it('splits the lines by promotion', () => {
    const byRule = promotionProductStatsByRule([
      line({ ruleIds: ['a', 'b'] }),
      line({ orderItemId: 'i2', orderId: 'o2', ruleIds: ['b'] }),
    ]);
    expect(byRule.get('a')?.salesCount).toBe(1);
    expect(byRule.get('b')?.salesCount).toBe(2);
    expect(byRule.get('b')?.revenue.toFixed(2)).toBe('40.00');
  });

  it('report: returned amount, top products by net revenue, sellers, clients', () => {
    const report = promotionProductReport(
      [
        line({
          returnedQuantity: d('3'),
          returnedTotal: d('20.00'),
          returnedDiscount: d('10.00'),
        }),
        line({
          orderItemId: 'i2',
          orderId: 'o2',
          productId: 'mask',
          title: 'Маска',
          quantity: d('1'),
          lineTotal: d('9.00'),
          discountTotal: d('1.00'),
          sellerStaffId: null,
          clientId: null,
        }),
        line({
          orderItemId: 'i3',
          orderId: 'o3',
          clientId: 'c2',
          sellerStaffId: 'boris',
        }),
      ],
      1,
    );
    expect(report.revenue.toFixed(2)).toBe('29.00');
    expect(report.discount.toFixed(2)).toBe('11.00');
    expect(report.returned.toFixed(2)).toBe('20.00');
    expect(report.salesCount).toBe(3);
    expect(report.clientIds.sort()).toEqual(['c1', 'c2']);
    // Shampoo: 20.00 + 20.00 - 20.00 = 20.00 > mask 9.00; the limit keeps one.
    expect(report.products).toHaveLength(1);
    expect(report.products[0]).toMatchObject({ productId: 'shampoo' });
    expect(report.products[0].quantity.toFixed(3)).toBe('3.000');
    expect(report.products[0].revenue.toFixed(2)).toBe('20.00');
    expect(
      report.sellers.map((seller) => [seller.staffId, seller.revenue.toFixed(2)]),
    ).toEqual([
      ['anna', '0.00'],
      ['boris', '20.00'],
    ]);
  });

  it('merge: revenue and discount with products, distinct clients, sellers on staff rows', () => {
    const products = promotionProductReport([
      line({ sellerStaffId: 'boris', clientId: 'c1' }),
      line({
        orderItemId: 'i2',
        orderId: 'o2',
        sellerStaffId: 'anna',
        clientId: 'c3',
      }),
    ]);
    const merged = mergePromotionReport(
      visits(),
      products,
      ['c1', 'c2'],
      new Map([['anna', { name: 'Anna', avatarUrl: 'a.png' }]]),
    );
    expect(merged.servicesRevenue.toFixed(2)).toBe('100.00');
    expect(merged.productsRevenue.toFixed(2)).toBe('40.00');
    expect(merged.revenue.toFixed(2)).toBe('140.00');
    expect(merged.productsDiscount.toFixed(2)).toBe('20.00');
    expect(merged.discount.toFixed(2)).toBe('35.00');
    expect(merged.salesCount).toBe(2);
    // c1 and c2 from bookings, c3 only from a sale.
    expect(merged.clientsCount).toBe(3);
    expect(merged.newClients).toBe(1);
    expect(merged.returningClients).toBe(2);
    expect(
      merged.staff.map((row) => ({
        staffId: row.staffId,
        name: row.name,
        avatarUrl: row.avatarUrl,
        bookingsCount: row.bookingsCount,
        revenue: row.revenue.toFixed(2),
        productsRevenue: row.productsRevenue.toFixed(2),
      })),
    ).toEqual([
      {
        staffId: 'boris',
        name: 'Boris',
        avatarUrl: null,
        bookingsCount: 2,
        revenue: '100.00',
        productsRevenue: '20.00',
      },
      // Only sold products: a row with bookingsCount 0.
      {
        staffId: 'anna',
        name: 'Anna',
        avatarUrl: 'a.png',
        bookingsCount: 0,
        revenue: '0.00',
        productsRevenue: '20.00',
      },
    ]);
  });

  it('merge: a seller who is gone keeps the name stored on the line', () => {
    const merged = mergePromotionReport(
      visits({ staff: [] }),
      promotionProductReport([line({ sellerStaffId: 'gone' })]),
      [],
      new Map(),
    );
    expect(merged.staff[0]).toMatchObject({
      staffId: 'gone',
      name: 'Anna (line)',
      bookingsCount: 0,
    });
  });
});
