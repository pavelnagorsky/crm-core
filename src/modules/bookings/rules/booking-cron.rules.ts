import { BookingStatus } from '../enums/booking-status.enum.js';

/** The visit should be over, and the client home, before asking for a review. */
export const REVIEW_REQUEST_DELAY_MS = 2 * 60 * 60 * 1000;
/** Older visits are no longer asked: the client has most likely forgotten them. */
export const REVIEW_REQUEST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Bookings that still hold their slot. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

/**
 * An unconfirmed request is not a visit: it is never completed, reminded or paid for
 * automatically, staff confirm or close it by hand.
 */
export const AUTO_COMPLETABLE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.CONFIRMED,
];

export function isAutoCompletable(
  status: BookingStatus,
  endAt: Date,
  now: Date,
): boolean {
  return (
    endAt.getTime() <= now.getTime() &&
    AUTO_COMPLETABLE_STATUSES.includes(status)
  );
}

/** Bookings that ended inside this window are asked for a review. */
export function reviewRequestWindow(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - REVIEW_REQUEST_MAX_AGE_MS),
    to: new Date(now.getTime() - REVIEW_REQUEST_DELAY_MS),
  };
}
