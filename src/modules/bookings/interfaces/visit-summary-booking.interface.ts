import { Booking } from '@prisma/client';
import { VisitDueBooking } from './visit-due-booking.interface.js';

/**
 * A booking whose payment summary is read. `startAt` and `locationId` decide whether the
 * visit is in payment tracking.
 */
export type VisitSummaryBooking = Pick<
  Booking,
  'id' | 'locationId' | 'startAt'
> &
  VisitDueBooking;
