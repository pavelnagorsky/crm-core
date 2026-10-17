import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { BookingWriteLockService } from './booking-write-lock.service.js';

describe('BookingWriteLockService', () => {
  const booking = {
    id: 'booking-1',
    locationId: 'location-1',
    status: 'CONFIRMED',
    updatedAt: new Date('2026-10-17T10:00:00Z'),
  } as BookingWithItems;

  it.each([
    [],
    [{ status: 'CANCELLED', updatedAt: booking.updatedAt }],
    [{ status: booking.status, updatedAt: new Date('2026-10-17T10:01:00Z') }],
  ])(
    'rejects a removed or concurrently changed booking: %j',
    async (...rows) => {
      const service = new BookingWriteLockService({} as never);
      const tx = { $queryRaw: vi.fn().mockResolvedValue(rows) };
      await expect(
        service.lockUnchangedBooking(tx as never, booking),
      ).rejects.toMatchObject({
        errorCode: 'BOOKING_CONCURRENT_UPDATE',
      });
    },
  );

  it('locks the matching booking in its location', async () => {
    const service = new BookingWriteLockService({} as never);
    const tx = { $queryRaw: vi.fn().mockResolvedValue([booking]) };
    await service.lockUnchangedBooking(tx as never, booking);
    const [sql, id, locationId] = tx.$queryRaw.mock.calls[0];
    expect(sql.join('?')).toContain('FOR UPDATE');
    expect(sql.join('?')).toContain('"deletedAt" IS NULL');
    expect([id, locationId]).toEqual([booking.id, booking.locationId]);
  });
});
