import { Prisma } from '@prisma/client';

/** Live bookings (service or visit product discount) and standalone sales of a client that got the personal client discount, all time. */
export interface ClientDiscountStats {
  bookingsCount: number;
  /** Standalone sales (no booking) with a confirmed product line that got the discount. */
  salesCount: number;
  /** Sum of the discounts of bookings and product lines, positive. */
  amount: Prisma.Decimal;
}
