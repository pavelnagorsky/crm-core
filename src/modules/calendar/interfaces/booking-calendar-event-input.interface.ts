export interface BookingCalendarEventInput {
  locationId: string;
  staffId: string;
  startAt: Date;
  endAt: Date;
  eventId?: string | null;
}
