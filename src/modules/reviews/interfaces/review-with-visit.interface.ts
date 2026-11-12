import { BookingVisit } from '../../bookings/visits/interfaces/booking-visit.interface.js';
import { ReviewWithStaff } from './review-with-staff.interface.js';

export interface ReviewWithVisit extends ReviewWithStaff {
  /** Null for imported reviews and deleted bookings. */
  visit: BookingVisit | null;
}
