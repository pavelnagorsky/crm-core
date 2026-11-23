import { BookingPriceRange } from './booking-price-range.interface.js';

/** What a staff member charges for one of their services over the online booking dates. */
export interface BookingStaffServicePrice extends BookingPriceRange {
  serviceId: string;
}
