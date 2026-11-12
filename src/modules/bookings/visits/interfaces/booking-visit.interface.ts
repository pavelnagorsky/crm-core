import { BookingVisitService } from './booking-visit-service.interface.js';

export interface BookingVisit {
  startAt: Date;
  /** In booking order; names as booked, so later renames don't change them. */
  services: BookingVisitService[];
}
