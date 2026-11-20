import { BookingChannel } from '../enums/booking-channel.enum.js';

/** Public page and widget cannot book a banned phone. The journal still can. */
export function isSelfBookingBlocked(
  channel: BookingChannel,
  bannedAt: Date | null,
): boolean {
  return channel !== BookingChannel.MANUAL && bannedAt !== null;
}
