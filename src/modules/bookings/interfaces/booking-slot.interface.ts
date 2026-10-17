export interface BookingSlot {
  staffId: string;
  startAt: Date;
  endAt: Date;
  calendarEventId?: string | null;
}
