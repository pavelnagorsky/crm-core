export interface CalendarRescheduleItem {
  serviceId: string;
  staffId: string;
  startAt: Date;
  endAt: Date;
  calendarEventId: string | null;
}
