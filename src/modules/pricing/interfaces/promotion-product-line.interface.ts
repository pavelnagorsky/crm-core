import { Prisma } from '@prisma/client';

/**
 * A confirmed product line of an active order with a PROMOTION layer, and what its posted
 * returns took back (docs/pricing-stage7-api.md, «Страница акции»).
 */
export interface PromotionProductLine {
  orderItemId: string;
  orderId: string;
  /** Promotions on the line (its PROMOTION layers). */
  ruleIds: string[];
  /** The booking of a visit order; null for a separate sale. */
  bookingId: string | null;
  /** The client of the booking, else of the sale. */
  clientId: string | null;
  productId: string | null;
  title: string;
  quantity: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  sellerStaffId: string | null;
  sellerName: string | null;
  returnedQuantity: Prisma.Decimal;
  returnedTotal: Prisma.Decimal;
  returnedDiscount: Prisma.Decimal;
}
