import { Prisma } from '@prisma/client';

/** Money that changed hands in a period, by method. `cash`, `card` and `total` are net of refunds. */
export interface PaymentMoneyTotals {
  cash: Prisma.Decimal;
  card: Prisma.Decimal;
  total: Prisma.Decimal;
  refundCash: Prisma.Decimal;
  refundCard: Prisma.Decimal;
}
