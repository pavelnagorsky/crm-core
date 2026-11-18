import { BookingWithItems } from './booking-with-items.interface.js';

/** A booking of the client with the bundle title it was booked under. */
export interface ClientBookingVisit {
  booking: BookingWithItems;
  bundleTitle: string | null;
}
