import { Prisma } from '@prisma/client';

/** Product revenue of one seller in a promotion report, net of returns. */
export interface PromotionSellerRevenue {
  staffId: string;
  /** Name stored on the line, for a seller who is gone. */
  name: string;
  revenue: Prisma.Decimal;
}
