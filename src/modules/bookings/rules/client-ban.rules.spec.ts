import { BookingChannel } from '../enums/booking-channel.enum.js';
import { isSelfBookingBlocked } from './client-ban.rules.js';

describe('isSelfBookingBlocked', () => {
  const bannedAt = new Date('2026-09-01T00:00:00.000Z');

  it('blocks public and widget booking for a banned client', () => {
    expect(isSelfBookingBlocked(BookingChannel.PUBLIC_PAGE, bannedAt)).toBe(
      true,
    );
    expect(isSelfBookingBlocked(BookingChannel.WIDGET, bannedAt)).toBe(true);
  });

  it('leaves internal booking open', () => {
    expect(isSelfBookingBlocked(BookingChannel.MANUAL, bannedAt)).toBe(false);
  });

  it('does not block a client who is not banned', () => {
    expect(isSelfBookingBlocked(BookingChannel.PUBLIC_PAGE, null)).toBe(false);
    expect(isSelfBookingBlocked(BookingChannel.WIDGET, null)).toBe(false);
  });
});
