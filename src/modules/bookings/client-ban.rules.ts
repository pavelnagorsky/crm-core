import { BookingSource } from './enums/booking-source.enum.js';

/** Public page and widget cannot book a banned phone. The journal still can. */
export function isSelfBookingBlocked(
  source: BookingSource,
  bannedAt: Date | null,
): boolean {
  return source !== BookingSource.MANUAL && bannedAt !== null;
}
