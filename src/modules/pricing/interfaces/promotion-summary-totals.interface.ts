import { Prisma } from '@prisma/client';

/** What all promotions of a location did to visits and product lines of one period. */
export interface PromotionSummaryTotals {
  /** Booking items with a promotion plus product lines net of returns. */
  revenue: Prisma.Decimal;
  /** Discounts given, positive, product returns deducted. */
  discount: Prisma.Decimal;
  bookingsCount: number;
  /** Separate sales with a promotion. */
  salesCount: number;
  newClients: number;
}
