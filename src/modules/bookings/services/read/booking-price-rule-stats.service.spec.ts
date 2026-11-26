import { Prisma } from '@prisma/client';
import { BookingPriceRuleStatsService } from './booking-price-rule-stats.service.js';

const NOW = new Date('2026-11-23T10:00:00.000Z');
const d = (value: string) => new Prisma.Decimal(value);
const layer = (
  ruleId: string | null,
  amount: string,
  bookingId: string,
  options: {
    kind?: 'SURCHARGE' | 'PROMOTION';
    itemId?: string;
    list?: string;
    charged?: string;
    custom?: string | null;
    acquiredClient?: string | null;
  } = {},
) => ({
  ruleId,
  kind: options.kind ?? 'SURCHARGE',
  amount: d(amount),
  bookingItem: {
    id: options.itemId ?? `${bookingId}-item`,
    bookingId,
    listPrice: d(options.list ?? '50.00'),
    chargedPrice: d(options.charged ?? '50.00'),
    customPrice: options.custom ? d(options.custom) : null,
    booking: {
      acquiredClient: options.acquiredClient
        ? { id: options.acquiredClient }
        : null,
    },
  },
});

describe('BookingPriceRuleStatsService', () => {
  const db = {
    bookingItemPriceAdjustment: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const service = new BookingPriceRuleStatsService(db as never);

  beforeEach(() => {
    vi.resetAllMocks();
    db.$queryRaw.mockResolvedValue([]);
  });

  it('asks for surcharge and promotion layers of the rules on live bookings with a visit in the last 30 days', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([]);
    await service.ruleStats('location', ['rule-1'], NOW);
    expect(db.bookingItemPriceAdjustment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          kind: { in: ['SURCHARGE', 'PROMOTION'] },
          ruleId: { in: ['rule-1'] },
          bookingItem: {
            locationId: 'location',
            startAt: {
              gte: new Date('2026-10-24T10:00:00.000Z'),
              lte: NOW,
            },
            booking: { status: { in: ['CONFIRMED', 'COMPLETED'] }, deletedAt: null },
          },
        },
      }),
    );
  });

  it('sums surcharge layers per rule and counts distinct bookings', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([
      layer('a', '10.50', 'booking-1'),
      layer('a', '4.50', 'booking-1'),
      layer('a', '6.00', 'booking-2'),
      layer('b', '3.00', 'booking-1'),
    ]);
    const stats = await service.ruleStats('location', ['a', 'b', 'c'], NOW);
    expect(stats.get('a')).toMatchObject({ ruleId: 'a', bookingsCount: 2 });
    expect(stats.get('a')?.amount.toFixed(2)).toBe('21.00');
    expect(stats.get('a')?.revenue.toFixed(2)).toBe('0.00');
    expect(stats.get('b')?.bookingsCount).toBe(1);
    expect(stats.has('c')).toBe(false);
  });

  it('gives a promotion its whole discount (list - charged) as a positive amount, item revenue, new clients and all-time usage', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([
      // The layer says 4.90, the item lost 5.00 with its rounding: the item discount counts.
      layer('p', '-4.90', 'booking-1', {
        kind: 'PROMOTION',
        itemId: 'i1',
        list: '50.00',
        charged: '45.00',
        acquiredClient: 'client-1',
      }),
      layer('p', '-3.00', 'booking-2', {
        kind: 'PROMOTION',
        itemId: 'i2',
        list: '30.00',
        charged: '27.00',
      }),
    ]);
    db.$queryRaw.mockResolvedValue([{ ruleId: 'p', count: 34 }]);
    const stats = await service.ruleStats('location', ['p'], NOW);
    const promo = stats.get('p');
    expect(promo?.amount.toFixed(2)).toBe('8.00');
    expect(promo?.revenue.toFixed(2)).toBe('72.00');
    expect(promo).toMatchObject({
      bookingsCount: 2,
      newClients: 1,
      usageCount: 34,
    });
  });

  it('skips the promotion of an item with a custom price, keeps its surcharge', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([
      layer('p', '-3.00', 'booking-1', {
        kind: 'PROMOTION',
        itemId: 'i1',
        list: '30.00',
        charged: '27.00',
        custom: '20.00',
        acquiredClient: 'client-1',
      }),
      layer('s', '5.00', 'booking-1', {
        kind: 'SURCHARGE',
        itemId: 'i1',
        custom: '20.00',
      }),
    ]);
    const stats = await service.ruleStats('location', ['p', 's'], NOW);
    expect(stats.has('p')).toBe(false);
    expect(stats.get('s')?.amount.toFixed(2)).toBe('5.00');
  });

  it('counts the discount of an item once over several layers of the rule', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([
      layer('p', '-2.00', 'booking-1', {
        kind: 'PROMOTION',
        itemId: 'i1',
        list: '30.00',
        charged: '27.00',
      }),
      layer('p', '-1.00', 'booking-1', {
        kind: 'PROMOTION',
        itemId: 'i1',
        list: '30.00',
        charged: '27.00',
      }),
    ]);
    const stats = await service.ruleStats('location', ['p'], NOW);
    expect(stats.get('p')?.amount.toFixed(2)).toBe('3.00');
    expect(stats.get('p')?.revenue.toFixed(2)).toBe('27.00');
  });

  it('keeps the all-time usage of a promotion without visits in the window', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([]);
    db.$queryRaw.mockResolvedValue([{ ruleId: 'p', count: 3 }]);
    const stats = await service.ruleStats('location', ['p'], NOW);
    expect(stats.get('p')).toMatchObject({ usageCount: 3, bookingsCount: 0 });
  });

  it('skips layers without a rule', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([
      layer(null, '5.00', 'booking-1'),
    ]);
    expect((await service.ruleStats('location', ['a'], NOW)).size).toBe(0);
  });

  it('does not query for no rules', async () => {
    expect((await service.ruleStats('location', [], NOW)).size).toBe(0);
    expect(db.bookingItemPriceAdjustment.findMany).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
