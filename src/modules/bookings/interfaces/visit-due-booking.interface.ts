import { Booking, BookingItem } from '@prisma/client';

/** The part of a booking that the services due read. */
export type VisitDueBooking = Pick<Booking, 'status' | 'deletedAt'> & {
  items: ReadonlyArray<Pick<BookingItem, 'chargedPrice' | 'customPrice'>>;
};
