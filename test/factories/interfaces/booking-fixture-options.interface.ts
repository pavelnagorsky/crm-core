import { BookingItem } from '@prisma/client';
import { BookingWithItems } from '../../../src/modules/bookings/interfaces/booking-with-items.interface.js';

export interface BookingFixtureOptions extends Partial<BookingWithItems> {
  item?: Partial<BookingItem>;
}
