import { Prisma } from '@prisma/client';

/** What one promotion did to product lines of a period, net of returns. */
export interface PromotionProductStats {
  /** Discount on the lines minus the discount of their returns, positive. */
  discount: Prisma.Decimal;
  /** Line totals minus the totals of their returns. */
  revenue: Prisma.Decimal;
  /** Separate sales (orders without a booking) with the promotion. */
  salesCount: number;
}
