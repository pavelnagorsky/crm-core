import { BookingStatus } from '../enums/booking-status.enum.js';
import { clientAccessExpiresAt } from './booking-client.rules.js';

const endAt = new Date('2026-10-28T11:00:00Z');

describe('clientAccessExpiresAt', () => {
  it.each([
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ])('keeps %s bookings reachable for 3 days after the visit', (status) => {
    expect(clientAccessExpiresAt({ endAt, status })).toEqual(
      new Date('2026-10-31T11:00:00Z'),
    );
  });

  it('keeps completed bookings reachable for 14 days to leave a review', () => {
    expect(
      clientAccessExpiresAt({ endAt, status: BookingStatus.COMPLETED }),
    ).toEqual(new Date('2026-11-11T11:00:00Z'));
  });
});
