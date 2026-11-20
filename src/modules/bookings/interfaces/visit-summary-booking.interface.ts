import { Booking } from '@prisma/client';
import { VisitDueBooking } from './visit-due-booking.interface.js';

/** A booking whose payment summary is read. */
export type VisitSummaryBooking = Pick<Booking, 'id'> & VisitDueBooking;
