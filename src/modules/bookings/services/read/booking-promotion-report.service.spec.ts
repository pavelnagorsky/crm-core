import { Prisma } from '@prisma/client';
import { BookingPromotionReportService } from './booking-promotion-report.service.js';

const NOW = new Date('2026-11-23T10:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const d = (value: string) => new Prisma.Decimal(value);

const item = (
  id: string,
  bookingId: string,
  over: {
    staffId?: string;
    clientId?: string | null;
    startAt?: Date;
    status?: string;
    charged?: string;
    custom?: string | null;
    discount?: string;
    acquired?: boolean;
  } = {},
) => {
  const startAt = over.startAt ?? daysAgo(20);
  const clientId = over.clientId === undefined ? 'client-1' : over.clientId;
  return {
    id,
    bookingId,
    staffId: over.staffId ?? 'anna',
    staffName: over.staffId === 'boris' ? 'Boris' : 'Anna',
    serviceTitle: 'Маникюр',
    startAt,
    chargedPrice: d(over.charged ?? '45.00'),
    customPrice: over.custom ? d(over.custom) : null,
    priceAdjustments: [{ amount: d(`-${over.discount ?? '5.00'}`) }],
    booking: {
      clientId,
      startAt,
      status: over.status ?? 'COMPLETED',
      clientFirstName: 'Ольга',
      clientLastName: clientId ?? '',
      clientPhone: '+375291112233',
      clientEmail: null,
      acquiredClient: over.acquired && clientId ? { id: clientId } : null,
    },
  };
};

describe('BookingPromotionReportService', () => {
  const db = {
    bookingItem: { findMany: vi.fn() },
    booking: { findMany: vi.fn() },
    bookingItemPriceAdjustment: { findMany: vi.fn() },
  };
  const staff = { listInLocation: vi.fn() };
  const service = new BookingPromotionReportService(db as never, staff as never);

  beforeEach(() => {
    vi.resetAllMocks();
    db.booking.findMany.mockResolvedValue([]);
    staff.listInLocation.mockResolvedValue([
      { id: 'anna', name: 'Анна', avatarFile: { url: 'https://a/anna.png' } },
    ]);
  });

  it('reads items of live bookings with a PROMOTION layer of the rule in the period up to now', async () => {
    db.bookingItem.findMany.mockResolvedValue([]);
    await service.report('location', 'rule', daysAgo(30), NOW);
    expect(db.bookingItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          locationId: 'location',
          startAt: { gte: daysAgo(30), lte: NOW },
          booking: { status: { not: 'CANCELLED' }, deletedAt: null },
          priceAdjustments: { some: { kind: 'PROMOTION', ruleId: 'rule' } },
        },
      }),
    );
  });

  it('sums revenue and discount, counts bookings, clients, new and returning', async () => {
    db.bookingItem.findMany.mockResolvedValue([
      item('i1', 'b1', { clientId: 'c1', acquired: true }),
      item('i2', 'b1', { clientId: 'c1', acquired: true, custom: '30.00' }),
      item('i3', 'b2', { clientId: 'c2', staffId: 'boris', discount: '3.00' }),
      item('i4', 'b3', { clientId: null }),
    ]);
    const report = await service.report('location', 'rule', null, NOW);
    expect(report.revenue.toFixed(2)).toBe('165.00');
    expect(report.discount.toFixed(2)).toBe('18.00');
    expect(report).toMatchObject({
      bookingsCount: 3,
      clientsCount: 2,
      newClients: 1,
      returningClients: 1,
    });
    expect(report.avgDiscount.toFixed(2)).toBe('6.00');
    expect(report.staff).toEqual([
      {
        staffId: 'anna',
        name: 'Анна',
        avatarUrl: 'https://a/anna.png',
        bookingsCount: 2,
        revenue: d('120.00'),
        discount: d('15.00'),
      },
      {
        staffId: 'boris',
        name: 'Boris',
        avatarUrl: null,
        bookingsCount: 1,
        revenue: d('45.00'),
        discount: d('3.00'),
      },
    ]);
  });

  it('returned rate: completed promotion visits 14+ days ago, a later booking without the promotion', async () => {
    db.bookingItem.findMany.mockResolvedValue([
      item('i1', 'b1', { clientId: 'back', startAt: daysAgo(20) }),
      item('i2', 'b2', { clientId: 'gone', startAt: daysAgo(30) }),
      item('i3', 'b3', { clientId: 'recent', startAt: daysAgo(5) }),
      item('i4', 'b4', { clientId: 'pending', startAt: daysAgo(40), status: 'CONFIRMED' }),
      // A later visit with the promotion is the last one: "gone" stays gone.
      item('i5', 'b5', { clientId: 'gone', startAt: daysAgo(16) }),
    ]);
    db.booking.findMany.mockResolvedValue([
      { clientId: 'back', startAt: daysAgo(10) },
      // Booked before the last promotion visit: does not count.
      { clientId: 'gone', startAt: daysAgo(18) },
    ]);
    const report = await service.report('location', 'rule', null, NOW);
    expect(db.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: ['back', 'gone'] },
          items: {
            none: {
              priceAdjustments: {
                some: { kind: 'PROMOTION', ruleId: 'rule' },
              },
            },
          },
        }),
      }),
    );
    expect(report.returnedRate).toBe(0.5);
    expect(report.notReturned).toEqual({
      count: 1,
      items: [
        {
          clientId: 'gone',
          name: 'Ольга gone',
          phone: '+375291112233',
          lastPromotionVisit: daysAgo(16),
        },
      ],
    });
  });

  it('no client is due yet: returned rate is null', async () => {
    db.bookingItem.findMany.mockResolvedValue([
      item('i1', 'b1', { startAt: daysAgo(3) }),
    ]);
    const report = await service.report('location', 'rule', null, NOW);
    expect(report.returnedRate).toBeNull();
    expect(report.notReturned.count).toBe(0);
    expect(db.booking.findMany).not.toHaveBeenCalled();
  });

  it('exports every not returned client with the visit services and staff', async () => {
    db.bookingItem.findMany.mockResolvedValue([
      item('i1', 'b1', { clientId: 'c1', startAt: daysAgo(20) }),
      item('i2', 'b1', { clientId: 'c1', startAt: daysAgo(20), staffId: 'boris' }),
    ]);
    expect(await service.notReturnedRows('location', 'rule', NOW)).toEqual([
      {
        name: 'Ольга c1',
        phone: '+375291112233',
        email: null,
        visitAt: daysAgo(20),
        staffNames: ['Anna', 'Boris'],
        serviceTitles: ['Маникюр', 'Маникюр'],
      },
    ]);
  });

  it('period totals of all promotions', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([
      {
        amount: d('-5.00'),
        bookingItem: {
          id: 'i1',
          bookingId: 'b1',
          chargedPrice: d('45.00'),
          customPrice: null,
          booking: { acquiredClient: { id: 'c1' } },
        },
      },
      {
        amount: d('-2.00'),
        bookingItem: {
          id: 'i2',
          bookingId: 'b2',
          chargedPrice: d('18.00'),
          customPrice: d('10.00'),
          booking: { acquiredClient: null },
        },
      },
    ]);
    const totals = await service.periodTotals('location', daysAgo(30), NOW);
    expect(totals.revenue.toFixed(2)).toBe('55.00');
    expect(totals.discount.toFixed(2)).toBe('7.00');
    expect(totals).toMatchObject({ bookingsCount: 2, newClients: 1 });
  });
});
