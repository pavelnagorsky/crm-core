import { CalendarBookingView } from './calendar-booking-view.interface.js';

export interface CalendarBookingFeed {
  bookings: CalendarBookingView[];
  linkedEventIds: string[];
}
