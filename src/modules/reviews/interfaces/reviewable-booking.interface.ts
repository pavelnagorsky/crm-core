import { Booking } from '@prisma/client';

/** Minimal booking shape the reviews domain needs; keeps ReviewsModule independent of bookings. */
export interface ReviewableBooking extends Pick<
  Booking,
  | 'id'
  | 'locationId'
  | 'clientId'
  | 'status'
  | 'deletedAt'
  | 'clientFirstName'
  | 'clientLastName'
> {
  items: { staffId: string; staffName: string }[];
}
