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
    db.$queryRaw.mockResolvedValue([
      { clientId: 'c1', bookingsCount: 3n, amount: '27.50' },
    ]);
    const stats = await service.clientDiscountStats(['c1', 'c2']);
    expect(stats.get('c1')).toEqual({
      bookingsCount: 3,
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

  it('splits a long page into chunks', async () => {
    db.$queryRaw.mockResolvedValue([]);
    const ids = Array.from({ length: 2500 }, (_, index) => `c${index}`);
    await service.clientDiscountStats(ids);
    expect(db.$queryRaw).toHaveBeenCalledTimes(3);
  });
});
