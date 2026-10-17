import { BookingWithItems } from './booking-with-items.interface.js';

export interface BookingCreationResult {
  booking: BookingWithItems;
  timezone: string;
  currency: string;
  bundleTitle: string | null;
}
