import { BookingFrequency } from './booking-frequency.interface.js';
import { ClientBookingVisit } from './client-booking-visit.interface.js';

/** A client's booking history across the brand, for the manual booking dialog. */
export interface ClientBookingSummary {
  visits: number;
  noShows: number;
  lastVisit: ClientBookingVisit | null;
  lastLocationVisit: ClientBookingVisit | null;
  upcoming: ClientBookingVisit | null;
  upcomingCount: number;
  services: BookingFrequency[];
  bundles: BookingFrequency[];
}
