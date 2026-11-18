import { BookingStatus } from '../enums/booking-status.enum.js';

/** Statuses staff set directly: on manual creation and by a status change. Cancellation has its own flow. */
export const SETTABLE_BOOKING_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
  BookingStatus.NO_SHOW,
] as const;

export type SettableBookingStatus = (typeof SETTABLE_BOOKING_STATUSES)[number];
