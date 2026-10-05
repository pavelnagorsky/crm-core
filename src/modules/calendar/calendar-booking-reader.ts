import { CalendarBookingFeed } from './interfaces/calendar-booking-feed.interface.js';

export abstract class CalendarBookingReader {
  abstract listForCalendar(
    businessId: string,
    rangeStart: Date,
    rangeEnd: Date,
    staffIds?: string[],
  ): Promise<CalendarBookingFeed>;

  abstract linkedCalendarEventIdsForBooking(businessId: string, bookingId: string): Promise<string[]>;
}
