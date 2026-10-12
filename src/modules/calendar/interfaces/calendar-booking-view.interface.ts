export interface CalendarBookingView {
  id: string;
  entityId: string;
  staffId: string;
  staffName: string;
  serviceTitles: string[];
  price: string;
  startAt: Date;
  endAt: Date;
}
