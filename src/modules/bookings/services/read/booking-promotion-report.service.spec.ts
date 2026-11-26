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
    list?: string;
    charged?: string;
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
    listPrice: d(over.list ?? '50.00'),
    chargedPrice: d(over.charged ?? '45.00'),
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
    // "Not returned" is counted from the current moment.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    db.booking.findMany.mockResolvedValue([]);
    staff.listInLocation.mockResolvedValue([
      { id: 'anna', name: 'Анна', avatarFile: { url: 'https://a/anna.png' } },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads items of confirmed and completed visits that started in the period, with a PROMOTION layer of the rule', async () => {
    db.bookingItem.findMany.mockResolvedValue([]);
    await service.report('location', 'rule', daysAgo(30), NOW);
    expect(db.bookingItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          locationId: 'location',
          customPrice: null,
          booking: {
            status: { in: ['CONFIRMED', 'COMPLETED'] },
            deletedAt: null,
            startAt: { gte: daysAgo(30), lte: NOW },
          },
          priceAdjustments: { some: { kind: 'PROMOTION', ruleId: 'rule' } },
        },
      }),
    );
  });

  it('a past window ends at its own bound while not returned is counted from now', async () => {
    db.bookingItem.findMany.mockResolvedValue([
      item('i1', 'b1', { clientId: 'old', startAt: daysAgo(50) }),
    ]);
    // The previous period ended 40 days ago; the visit 50 days ago is long due.
    const report = await service.report(
      'location',
      'rule',
      daysAgo(60),
      daysAgo(40),
    );
    expect(db.bookingItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          booking: expect.objectContaining({
            startAt: { gte: daysAgo(60), lte: daysAgo(40) },
          }),
        }),
      }),
    );
    expect(report.notReturned.count).toBe(1);
    expect(report.returnedRate).toBe(0);
  });

  it('sums revenue and discount (list - charged), counts bookings, clients, new and returning', async () => {
    db.bookingItem.findMany.mockResolvedValue([
      item('i1', 'b1', { clientId: 'c1', acquired: true }),
      item('i2', 'b1', { clientId: 'c1', acquired: true, list: '40.00', charged: '30.00' }),
      item('i3', 'b2', { clientId: 'c2', staffId: 'boris', list: '48.00', charged: '45.00' }),
      item('i4', 'b3', { clientId: null }),
    ]);
    const report = await service.report('location', 'rule', null, NOW);
    expect(report.revenue.toFixed(2)).toBe('165.00');
    expect(report.discount.toFixed(2)).toBe('23.00');
    expect(report).toMatchObject({
      bookingsCount: 3,
      clientsCount: 2,
      newClients: 1,
      returningClients: 1,
    });
    expect(report.avgDiscount.toFixed(2)).toBe('7.67');
    expect(report.staff).toEqual([
      {
        staffId: 'anna',
        name: 'Анна',
        avatarUrl: 'https://a/anna.png',
        bookingsCount: 2,
        revenue: d('120.00'),
        discount: d('20.00'),
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

  it('returned rate: promotion visits of the base 14+ days ago, a later booking without the promotion', async () => {
    db.bookingItem.findMany.mockResolvedValue([
      item('i1', 'b1', { clientId: 'back', startAt: daysAgo(20) }),
      item('i2', 'b2', { clientId: 'gone', startAt: daysAgo(30) }),
      item('i3', 'b3', { clientId: 'recent', startAt: daysAgo(5) }),
      // A confirmed visit that has started counts like a completed one.
      item('i4', 'b4', { clientId: 'confirmed', startAt: daysAgo(40), status: 'CONFIRMED' }),
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
          clientId: { in: ['back', 'gone', 'confirmed'] },
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
    expect(report.returnedRate).toBe(0.3333);
    expect(report.notReturned).toEqual({
      count: 2,
      items: [
        {
          clientId: 'gone',
          name: 'Ольга gone',
          phone: '+375291112233',
          lastPromotionVisit: daysAgo(16),
        },
        {
          clientId: 'confirmed',
          name: 'Ольга confirmed',
          phone: '+375291112233',
          lastPromotionVisit: daysAgo(40),
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

  it('a custom price is not a promotion visit: the page skips such items in the query', async () => {
    db.bookingItem.findMany.mockResolvedValue([]);
    await service.notReturnedRows('location', 'rule', NOW);
    expect(db.bookingItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customPrice: null }),
      }),
    );
  });

  it('period totals of all promotions: items without a custom price, whole discount once per item', async () => {
    db.bookingItemPriceAdjustment.findMany.mockResolvedValue([
      {
        bookingItem: {
          id: 'i1',
          bookingId: 'b1',
          listPrice: d('50.00'),
          chargedPrice: d('45.00'),
          booking: { acquiredClient: { id: 'c1' } },
        },
      },
      {
        bookingItem: {
          id: 'i2',
          bookingId: 'b2',
          listPrice: d('20.00'),
          chargedPrice: d('18.00'),
          booking: { acquiredClient: null },
        },
      },
      // A second promotion layer of the same item does not count twice.
      {
        bookingItem: {
          id: 'i2',
          bookingId: 'b2',
          listPrice: d('20.00'),
          chargedPrice: d('18.00'),
          booking: { acquiredClient: null },
        },
      },
    ]);
    const totals = await service.periodTotals('location', daysAgo(30), NOW);
    expect(db.bookingItemPriceAdjustment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookingItem: expect.objectContaining({ customPrice: null }),
        }),
      }),
    );
    expect(totals.revenue.toFixed(2)).toBe('63.00');
    expect(totals.discount.toFixed(2)).toBe('7.00');
    expect(totals).toMatchObject({ bookingsCount: 2, newClients: 1 });
  });
});
