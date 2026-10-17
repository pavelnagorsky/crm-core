import { Prisma } from '@prisma/client';

export interface ProductSalesSnapshot {
  revenue: Prisma.Decimal;
  standaloneOrderCount: number;
  /** Distinct linked bookings that are not a completed visit in the same window. */
  extraLinkedBookingCount: number;
}
