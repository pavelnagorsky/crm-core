import { OrderItemType, OrderStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { OrdersAnalyticsService } from './orders-analytics.service.js';

describe('OrdersAnalyticsService', () => {
  const db = { $queryRaw: vi.fn() };
  const service = new OrdersAnalyticsService(db as unknown as DatabaseService);

  beforeEach(() => vi.clearAllMocks());

  it('reads only posted product lines and applies snapshot filters', async () => {
    db.$queryRaw.mockResolvedValue([
      {
        revenue: '42.50',
        standaloneOrderCount: 2n,
        linkedBookingIds: ['booking-1'],
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
    expect(query.values).toContain(OrderStatus.POSTED);
    expect(query.values).toContain(OrderItemType.PRODUCT);
    expect(result.revenue.toFixed(2)).toBe('42.50');
    expect(result.standaloneOrderCount).toBe(2);
    expect(result.linkedBookingIds).toEqual(['booking-1']);
  });

  it('does not query the database for an empty brand location scope', async () => {
    await expect(
      service.clientRevenue({
        locationIds: [],
        from: new Date('2026-10-01T00:00:00.000Z'),
        to: new Date('2026-10-02T00:00:00.000Z'),
      }),
    ).resolves.toEqual([]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
