import { Prisma } from '@prisma/client';

export interface OrderTotals {
  listTotalAmount: Prisma.Decimal;
  subtotalAmount: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}
