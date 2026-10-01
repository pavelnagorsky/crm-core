export interface CalendarBookingView {
  id: string;
  staffId: string;
  staffName: string;
  clientFirstName: string;
  clientLastName: string;
  serviceTitle: string;
  servicePrice: string;
  customPrice: string | null;
  startAt: Date;
  endAt: Date;
  calendarEventId: string | null;
}
