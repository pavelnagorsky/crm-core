import { StaffBookingEvent } from '../enums/staff-booking-event.enum.js';

export interface StaffBookingNotificationData {
  event: StaffBookingEvent;
  recipientEmail: string;
  recipientFirstName: string | null;
  locationId: string;
  clientName: string;
  clientPhone: string | null;
  serviceTitle: string;
  staffName: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  /** For a move: the start before it. */
  previousStartAt: Date | null;
  cancellationReason: string | null;
  bookingUrl: string;
}
