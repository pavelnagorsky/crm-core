import { BookingSource } from '../enums/booking-source.enum.js';
import { isSelfBookingBlocked } from './client-ban.rules.js';

describe('isSelfBookingBlocked', () => {
  const bannedAt = new Date('2026-09-01T00:00:00.000Z');

  it('blocks public and widget booking for a banned client', () => {
    expect(isSelfBookingBlocked(BookingSource.PUBLIC_PAGE, bannedAt)).toBe(
      true,
    );
    expect(isSelfBookingBlocked(BookingSource.WIDGET, bannedAt)).toBe(true);
  });

  it('leaves internal booking open', () => {
    expect(isSelfBookingBlocked(BookingSource.MANUAL, bannedAt)).toBe(false);
    expect(isSelfBookingBlocked(BookingSource.WALK_IN, bannedAt)).toBe(false);
  });

  it('does not block a client who is not banned', () => {
    expect(isSelfBookingBlocked(BookingSource.PUBLIC_PAGE, null)).toBe(false);
    expect(isSelfBookingBlocked(BookingSource.WIDGET, null)).toBe(false);
  });
});
