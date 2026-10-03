import { BookingSource } from '../enums/booking-source.enum.js';

export interface BookingAttribution {
  source: BookingSource;
  bookingPageId: string | null;
  bookingWidgetId: string | null;
}
