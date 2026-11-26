import { Prisma } from '@prisma/client';
import { PromotionReportStaff } from './promotion-report-staff.interface.js';

/** Promotion results of one staff member: the visits and the products they sold. */
export interface PromotionReportStaffRow extends PromotionReportStaff {
  /** Products sold by the staff member with the promotion, net of returns. */
  productsRevenue: Prisma.Decimal;
}
