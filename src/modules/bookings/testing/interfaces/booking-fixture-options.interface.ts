import { BookingItem } from '@prisma/client';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';

export interface BookingFixtureOptions extends Partial<BookingWithItems> {
  item?: Partial<BookingItem>;
}
