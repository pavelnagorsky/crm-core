import { Prisma } from '@prisma/client';

/** Past bookings and sales a draft promotion would have reached, and the discount by the price list. */
export interface PromotionMatches {
  bookingsCount: number;
  /** Separate sales with a matching product line. */
  salesCount: number;
  /** On the booking items and the sale lines. */
  discount: Prisma.Decimal;
}
