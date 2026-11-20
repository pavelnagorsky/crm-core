import type { BookingStatus } from '@prisma/client';
import type { PaymentStatus } from '../../payments/enums/payment-status.enum.js';

export interface CalendarBookingView {
  id: string;
  entityId: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  staffId: string;
  staffName: string;
  clientName: string;
  serviceTitles: string[];
  price: string;
  startAt: Date;
  endAt: Date;
}
