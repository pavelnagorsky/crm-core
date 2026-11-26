import { Prisma } from '@prisma/client';

/** One product of a promotion report, net of returns. */
export interface PromotionReportProduct {
  productId: string;
  title: string;
  quantity: Prisma.Decimal;
  revenue: Prisma.Decimal;
  discount: Prisma.Decimal;
}
