import { OrderReturnStatus, Prisma } from '@prisma/client';

/** A sold line with its returns, as the return allocation reads it. */
export interface ReturnAllocationSource {
  quantity: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  lineCostSnapshot: Prisma.Decimal | null;
  returnItems: readonly {
    quantity: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    lineCostSnapshot: Prisma.Decimal | null;
    return: { status: OrderReturnStatus };
  }[];
}
