import { BookingPriceAnalyticsService } from './booking-price-analytics.service.js';

const FROM = new Date('2026-11-01T00:00:00Z');
const TO = new Date('2026-12-01T00:00:00Z');
const NOW = new Date('2026-11-26T10:00:00Z');
const query = { from: FROM, to: TO, now: NOW, changedOnly: true };

describe('BookingPriceAnalyticsService', () => {
  const db = { bookingItem: { findMany: vi.fn(), count: vi.fn() } };
  const service = new BookingPriceAnalyticsService(db as never);

  beforeEach(() => {
    vi.resetAllMocks();
    db.bookingItem.findMany.mockResolvedValue([]);
  });

  it('reads items of confirmed and completed visits of the location that started in the period, by the Booking index columns', async () => {
    await service.items('loc', query);
    expect(db.bookingItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          locationId: 'loc',
          booking: {
            locationId: 'loc',
            deletedAt: null,
            status: { in: ['CONFIRMED', 'COMPLETED'] },
            startAt: { gte: FROM, lt: TO, lte: NOW },
          },
        }),
      }),
    );
  });

  it('counts the candidates with the same where', async () => {
    db.bookingItem.count.mockResolvedValue(12);
    expect(await service.countCandidates('loc', { ...query, staffId: 's1' })).toBe(12);
    expect(db.bookingItem.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ locationId: 'loc', staffId: 's1' }),
    });
  });

  it('has no items without a staff member: no query', async () => {
    const none = { ...query, staffId: null };
    expect(await service.items('loc', none)).toEqual([]);
    expect(await service.countCandidates('loc', none)).toBe(0);
    expect(db.bookingItem.findMany).not.toHaveBeenCalled();
    expect(db.bookingItem.count).not.toHaveBeenCalled();
  });
});
