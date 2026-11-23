import { BookingPriceRange } from './booking-price-range.interface.js';
import { BookingStaffServicePrice } from './booking-staff-service-price.interface.js';

/** Prices of the booking page catalog, by catalog item and by staff member. */
export interface BookingSetupPrices {
  /** By service id. */
  services: ReadonlyMap<string, BookingPriceRange>;
  /** By bundle id. */
  bundles: ReadonlyMap<string, BookingPriceRange>;
  /** By staff id: the price of each service the staff member performs. */
  staffServicePrices: ReadonlyMap<string, BookingStaffServicePrice[]>;
}
