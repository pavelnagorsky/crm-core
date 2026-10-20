import {
  OrderItemStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { SeriesGranularity } from '../../../dashboard/enums/series-granularity.enum.js';
import { BookingsAggregatesService } from '../../../bookings/aggregates/services/bookings-aggregates.service.js';
import { OrdersAggregatesService } from './orders-aggregates.service.js';

describe('OrdersAggregatesService', () => {
  const db = { $queryRaw: vi.fn() };
  const bookings = {
    completedBookingExists: vi
      .fn()
      .mockReturnValue(Prisma.sql`EXISTS (SELECT 1)`),
    clientRevenueClientIdsSql: vi.fn(),
    clientRevenueClientsByBucketSql: vi.fn(),
  };
  const service = new OrdersAggregatesService(
    db as unknown as DatabaseService,
    bookings as unknown as BookingsAggregatesService,
  );

  beforeEach(() => vi.clearAllMocks());

  it('reads only confirmed product lines and applies snapshot filters', async () => {
    db.$queryRaw.mockResolvedValue([
      {
        revenue: '42.50',
        standaloneOrderCount: 2n,
        extraLinkedBookingCount: 1n,
      },
    ]);

    const result = await service.productSalesSnapshot({
      locationIds: ['location-1'],
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-02T00:00:00.000Z'),
      staffId: 'staff-1',
      catalogItemId: 'product-1',
      categoryId: 'category-1',
    });

    const query = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toContain('o."status"::text =');
    expect(query.sql).toContain('scoped_item."categoryId"');
    expect(query.sql).toContain('COUNT(DISTINCT o."bookingId")');
    expect(query.sql).toContain('EXISTS (SELECT 1)');
    expect(query.sql).not.toContain('ARRAY_AGG');
    expect(bookings.completedBookingExists).toHaveBeenCalledWith(
      expect.objectContaining({
        locationIds: ['location-1'],
        staffId: 'staff-1',
        catalogItemId: 'product-1',
        categoryId: 'category-1',
      }),
      expect.anything(),
    );
    expect(query.values).toContain(OrderStatus.ACTIVE);
    expect(query.values).toContain(OrderItemStatus.CONFIRMED);
    expect(query.values).toContain(OrderItemType.PRODUCT);
    expect(result.revenue.toFixed(2)).toBe('42.50');
    expect(result.standaloneOrderCount).toBe(2);
    expect(result.extraLinkedBookingCount).toBe(1);
  });

  it('builds product KPI snapshots from confirmed product lines', async () => {
    db.$queryRaw.mockResolvedValue([
      {
        revenue: '120.00',
        grossProfit: '45.50',
        buyerCount: 3n,
        repeatBuyerCount: 2n,
      },
    ]);

    const result = await service.productSalesKpiSnapshot({
      locationIds: ['location-1'],
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-02T00:00:00.000Z'),
      staffId: 'staff-1',
      catalogItemId: 'product-1',
      categoryId: 'category-1',
    });

    const query = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toContain('i."lineCostSnapshot"');
    expect(query.sql).toContain('COUNT(DISTINCT o."clientId")');
    expect(query.sql).toContain('pi."occurredAt" < i."occurredAt"');
    expect(query.sql).toContain('i."sellerStaffId"');
    expect(query.sql).toContain('pi."sellerStaffId"');
    expect(query.values).toContain(OrderItemType.PRODUCT);
    expect(query.values).toContain(OrderItemStatus.CONFIRMED);
    expect(result.revenue.toFixed(2)).toBe('120.00');
    expect(result.grossProfit.toFixed(2)).toBe('45.50');
    expect(result.buyerCount).toBe(3);
    expect(result.repeatBuyerCount).toBe(2);
  });

  it('sums product revenue without calculating booking or buyer counts', async () => {
    db.$queryRaw.mockResolvedValue([{ revenue: '1234.56' }]);
    const from = new Date('2026-10-01T00:00:00.000Z');
    const to = new Date('2026-10-02T00:00:00.000Z');
    const total = await service.productRevenue({
      locationIds: ['location-1', 'location-2'],
      from,
      to,
      staffId: 'staff-1',
    });
    const query = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(total.toFixed(2)).toBe('1234.56');
    expect(query.sql).toContain('SUM(i."lineTotal")');
    expect(query.sql).toContain('o."locationId" IN (?,?)');
    expect(query.sql).toContain('i."sellerStaffId"');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'location-1',
        'location-2',
        'staff-1',
        from,
        to,
        OrderStatus.ACTIVE,
        OrderItemStatus.CONFIRMED,
        OrderItemType.PRODUCT,
      ]),
    );
    expect(query.sql).not.toContain('COUNT(');
    expect(bookings.completedBookingExists).not.toHaveBeenCalled();
  });

  it('returns zero revenue without querying for an empty location scope', async () => {
    const total = await service.productRevenue({
      locationIds: [],
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-02T00:00:00.000Z'),
    });
    expect(total.isZero()).toBe(true);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not query the database for an empty brand location scope', async () => {
    await expect(
      service.clientRevenue({
        locationIds: [],
        from: new Date('2026-10-01T00:00:00.000Z'),
        to: new Date('2026-10-02T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      revenue: expect.anything(),
      activeClients: 0,
      sharedClients: 0,
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it.each(['productSalesKpiSnapshot', 'productSalesKpiSeries'] as const)(
    '%s deduplicates buyers across locations and looks for prior sales in the same scope',
    async (operation) => {
      db.$queryRaw.mockResolvedValue([]);
      await service[operation]({
        locationIds: ['location-1', 'location-2'],
        from: new Date('2026-10-01T00:00:00.000Z'),
        to: new Date('2026-10-02T00:00:00.000Z'),
        granularity: SeriesGranularity.DAY,
        timezone: 'UTC',
      });
      const query = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(query.sql).toContain('o."locationId" IN (?,?)');
      expect(query.sql).toContain('po."locationId" IN (?,?)');
      expect(query.sql).toContain('COUNT(DISTINCT o."clientId")');
      expect(query.sql).toContain('po."clientId" = o."clientId"');
      expect(query.sql).toContain('pi."occurredAt" < i."occurredAt"');
      expect(
        query.values.filter((value) => value === 'location-1'),
      ).toHaveLength(2);
      expect(
        query.values.filter((value) => value === 'location-2'),
      ).toHaveLength(2);
      expect(query.values).not.toContain(undefined);
    },
  );

  it('uses a false predicate for an empty product location scope', async () => {
    db.$queryRaw.mockResolvedValue([]);
    const result = await service.productSalesKpiSnapshot({
      locationIds: [],
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-02T00:00:00.000Z'),
    });
    const query = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toContain('WHERE FALSE');
    expect(query.sql).not.toContain('IN ()');
    expect(result.buyerCount).toBe(0);
  });
});
