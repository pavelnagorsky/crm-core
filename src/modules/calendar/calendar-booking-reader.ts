import { CalendarBookingFeed } from './interfaces/calendar-booking-feed.interface.js';

export abstract class CalendarBookingReader {
  abstract listForCalendar(
    locationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    staffIds?: string[],
  ): Promise<CalendarBookingFeed>;

  abstract linkedCalendarEventIdsForBooking(
    locationId: string,
    bookingId: string,
  ): Promise<string[]>;
}
