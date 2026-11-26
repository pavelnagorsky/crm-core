import { Prisma } from '@prisma/client';
import { PromotionReport } from './promotion-report.interface.js';
import { PromotionReportProduct } from './promotion-report-product.interface.js';
import { PromotionReportStaffRow } from './promotion-report-staff-row.interface.js';

/**
 * Results of one promotion over visits and product lines (docs/pricing-stage7-api.md):
 * revenue and discount include the products net of returns.
 */
export interface PromotionFullReport extends Omit<PromotionReport, 'staff'> {
  servicesRevenue: Prisma.Decimal;
  productsRevenue: Prisma.Decimal;
  productsDiscount: Prisma.Decimal;
  productsReturned: Prisma.Decimal;
  salesCount: number;
  products: PromotionReportProduct[];
  staff: PromotionReportStaffRow[];
}
