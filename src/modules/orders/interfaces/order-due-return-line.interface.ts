import { OrderReturnStatus, Prisma } from '@prisma/client';

/** The part of a return line that the amount due reads. */
export interface OrderDueReturnLine {
  lineTotal: Prisma.Decimal;
  return: { status: OrderReturnStatus };
}
