import { Prisma } from '@prisma/client';
import { BookingsAggregatesService } from './bookings-aggregates.service.js';

describe('BookingsAggregatesService.clientDiscountStats', () => {
  const db = { $queryRaw: vi.fn() };
  const service = new BookingsAggregatesService(db as never, {} as never);

  beforeEach(() => vi.clearAllMocks());

  it('reads nothing for no clients', async () => {
    expect((await service.clientDiscountStats([])).size).toBe(0);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('counts live bookings with the client discount and sums it', async () => {
    db.$queryRaw
      .mockResolvedValueOnce([
        { clientId: 'c1', bookingsCount: 3n, amount: '27.50' },
      ])
      .mockResolvedValueOnce([]);
    const stats = await service.clientDiscountStats(['c1', 'c2']);
    expect(stats.get('c1')).toEqual({
      bookingsCount: 3,
      salesCount: 0,
      amount: new Prisma.Decimal('27.50'),
    });
    expect(stats.has('c2')).toBe(false);
    const query = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toContain('b."deletedAt" IS NULL');
    expect(query.sql).toContain('b."status"::text <> ?');
    expect(query.sql).toContain(`a."kind"::text = 'CLIENT_DISCOUNT'`);
    expect(query.values).toEqual(
      expect.arrayContaining(['c1', 'c2', 'CANCELLED']),
    );
  });

  it('counts standalone sales apart from visits and adds their amount', async () => {
    db.$queryRaw
      .mockResolvedValueOnce([
        { clientId: 'c1', bookingsCount: 1n, amount: '10.00' },
      ])
      .mockResolvedValueOnce([
        { clientId: 'c1', salesCount: 2n, amount: '4.25' },
        { clientId: 'c2', salesCount: 1n, amount: '3.00' },
      ]);
    const stats = await service.clientDiscountStats(['c1', 'c2']);
    expect(stats.get('c1')).toEqual({
      bookingsCount: 1,
      salesCount: 2,
      amount: new Prisma.Decimal('14.25'),
    });
    expect(stats.get('c2')).toEqual({
      bookingsCount: 0,
      salesCount: 1,
      amount: new Prisma.Decimal('3.00'),
    });
    const query = db.$queryRaw.mock.calls[1][0] as Prisma.Sql;
    expect(query.sql).toContain(`i."status"::text = 'CONFIRMED'`);
    expect(query.sql).toContain(`o."status"::text = 'ACTIVE'`);
    expect(query.sql).toContain('o."bookingId" IS NULL');
    const visits = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(visits.sql).toContain('UNION ALL');
    expect(visits.sql).toContain('COUNT(DISTINCT x."bookingId")');
    // Service lines of a completed visit carry copies of the booking layers.
    const orderBranch = visits.sql.slice(visits.sql.indexOf('UNION ALL'));
    expect(orderBranch).toContain(`i."type"::text = 'PRODUCT'`);
    expect(query.sql).toContain(`a."kind"::text = 'CLIENT_DISCOUNT'`);
  });

  it('splits a long page into chunks', async () => {
    db.$queryRaw.mockResolvedValue([]);
    const ids = Array.from({ length: 2500 }, (_, index) => `c${index}`);
    await service.clientDiscountStats(ids);
    expect(db.$queryRaw).toHaveBeenCalledTimes(6);
  });
});
