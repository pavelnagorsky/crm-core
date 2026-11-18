import { BookingFrequency } from './booking-frequency.interface.js';

/** Services and bundles a staff member performed most often recently. */
export interface StaffPopularServices {
  staffId: string;
  items: BookingFrequency[];
}
