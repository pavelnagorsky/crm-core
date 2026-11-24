import { BookingChannel, Prisma } from '@prisma/client';

/** A booked item of the past, to count what a draft promotion would have matched. */
export interface PromotionMatchItem {
  bookingId: string;
  serviceId: string;
  staffId: string;
  bundleId: string | null;
  /** Start of the visit (the booking). */
  visitStartAt: Date;
  channel: BookingChannel;
  listPrice: Prisma.Decimal;
}
