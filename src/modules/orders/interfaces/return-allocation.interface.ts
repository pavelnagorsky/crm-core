import { Prisma } from '@prisma/client';

/** Money of one return line. */
export interface ReturnAllocation {
  lineSubtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  lineCostSnapshot: Prisma.Decimal | null;
}
