import type { BookingStatus } from '@prisma/client';

export interface CalendarBookingView {
  id: string;
  entityId: string;
  status: BookingStatus;
  staffId: string;
  staffName: string;
  clientName: string;
  serviceTitles: string[];
  price: string;
  startAt: Date;
  endAt: Date;
}
