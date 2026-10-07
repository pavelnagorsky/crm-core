import { Prisma } from '@prisma/client';

export interface ProductOrderCommissionLine {
  orderItemId: string;
  staffId: string;
  amount: Prisma.Decimal;
  description: string;
}
