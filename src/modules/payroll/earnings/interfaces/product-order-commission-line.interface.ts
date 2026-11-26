import { Prisma } from '@prisma/client';

export interface ProductOrderCommissionLine {
  orderItemId: string;
  staffId: string;
  /** Line total after discounts: the CHARGED commission base. */
  amount: Prisma.Decimal;
  /** quantity x listUnitPrice at currency scale: the LIST commission base. */
  listAmount: Prisma.Decimal;
  description: string;
}
