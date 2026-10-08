import {
  OrderItemStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { BookingsAggregatesService } from '../../bookings/aggregates/bookings-aggregates.service.js';
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
      locationId: 'location-1',
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
        locationId: 'location-1',
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
});
