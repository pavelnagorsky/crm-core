import { Prisma } from '@prisma/client';
import { PromotionReportProduct } from './promotion-report-product.interface.js';
import { PromotionSellerRevenue } from './promotion-seller-revenue.interface.js';

/** Product part of a promotion report (docs/pricing-stage7-api.md, «Страница акции»). */
export interface PromotionProductReport {
  /** Σ lineTotal of the lines minus their returns. */
  revenue: Prisma.Decimal;
  /** Σ discountTotal of the lines minus the discount of their returns. */
  discount: Prisma.Decimal;
  /** Σ lineTotal of the returns of these lines. */
  returned: Prisma.Decimal;
  /** Separate sales with the promotion. */
  salesCount: number;
  /** Clients of the lines (of the booking, else of the sale). */
  clientIds: string[];
  /** Top products by revenue. */
  products: PromotionReportProduct[];
  sellers: PromotionSellerRevenue[];
}
