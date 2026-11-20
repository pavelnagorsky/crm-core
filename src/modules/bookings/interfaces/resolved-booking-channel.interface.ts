import { BookingChannel } from '../enums/booking-channel.enum.js';

/** The channel of a new booking and the published page or widget it came through, if any. */
export interface ResolvedBookingChannel {
  channel: BookingChannel;
  bookingPageId: string | null;
  bookingWidgetId: string | null;
}
