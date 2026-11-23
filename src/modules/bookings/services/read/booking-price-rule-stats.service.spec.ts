import { Prisma } from '@prisma/client';
import { BookingPriceRuleStatsService } from './booking-price-rule-stats.service.js';

const NOW = new Date('2026-11-23T10:00:00.000Z');
const layer = (ruleId: string | null, amount: string, bookingId: string) => ({
  ruleId,
  amount: new Prisma.Decimal(amount),
  bookingItem: { bookingId },
});

describe('BookingPriceRuleStatsService', () => {
  const db = { bookingItemPriceAdjustment: { findMany: vi.fn() } };
  const service = new BookingPriceRuleStatsService(db as never);

  beforeEach(() => vi.resetAllMocks());

  it('asks for surcharge layers of the rules on non-cancelled bookings with a visit in the last 30 days', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([]);
    await service.surchargeStats('location', ['rule-1'], NOW);
    expect(db.bookingItemPriceAdjustment.findMany).toHaveBeenCalledWith({
      where: {
        kind: 'SURCHARGE',
        ruleId: { in: ['rule-1'] },
        bookingItem: {
          locationId: 'location',
          startAt: {
            gte: new Date('2026-10-24T10:00:00.000Z'),
            lte: NOW,
          },
          booking: { status: { not: 'CANCELLED' }, deletedAt: null },
        },
      },
      select: {
        ruleId: true,
        amount: true,
        bookingItem: { select: { bookingId: true } },
      },
    });
  });

  it('sums the layers per rule and counts distinct bookings', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([
      layer('a', '10.50', 'booking-1'),
      layer('a', '4.50', 'booking-1'),
      layer('a', '6.00', 'booking-2'),
      layer('b', '3.00', 'booking-1'),
    ]);
    const stats = await service.surchargeStats(
      'location',
      ['a', 'b', 'c'],
      NOW,
    );
    expect(stats.get('a')).toMatchObject({ ruleId: 'a', bookingsCount: 2 });
    expect(stats.get('a')?.amount.toFixed(2)).toBe('21.00');
    expect(stats.get('b')?.bookingsCount).toBe(1);
    expect(stats.has('c')).toBe(false);
  });

  it('skips layers without a rule', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([
      layer(null, '5.00', 'booking-1'),
    ]);
    expect((await service.surchargeStats('location', ['a'], NOW)).size).toBe(0);
  });

  it('does not query for no rules', async () => {
    expect((await service.surchargeStats('location', [], NOW)).size).toBe(0);
    expect(db.bookingItemPriceAdjustment.findMany).not.toHaveBeenCalled();
  });
});
