import { Booking } from '@prisma/client';
import { BookingStatus } from '../enums/booking-status.enum.js';

const HOUR_MS = 60 * 60 * 1000;
/** Booked well ahead: remind the day before. */
export const REMINDER_LEAD_MS = 24 * HOUR_MS;
/** Booked within a day: a day-before reminder would arrive with the confirmation, remind shortly before. */
export const SHORT_REMINDER_LEAD_MS = 2 * HOUR_MS;
/** Booked this close to the visit: the confirmation is reminder enough. */
export const NO_REMINDER_LEAD_MS = 6 * HOUR_MS;

/**
 * When to remind about a booking that became confirmed at `confirmedAt`: on creation, on
 * confirmation of a request, or on a move. Only confirmed bookings are reminded.
 */
export function reminderDueAt(
  booking: Pick<Booking, 'status' | 'startAt'>,
  confirmedAt: Date,
): Date | null {
  if (booking.status !== BookingStatus.CONFIRMED) return null;
  const start = booking.startAt.getTime();
  const lead = start - confirmedAt.getTime();
  if (lead > REMINDER_LEAD_MS) return new Date(start - REMINDER_LEAD_MS);
  if (lead > NO_REMINDER_LEAD_MS)
    return new Date(start - SHORT_REMINDER_LEAD_MS);
  return null;
}
