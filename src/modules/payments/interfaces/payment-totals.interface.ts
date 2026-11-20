import { Prisma } from '@prisma/client';

/** Sums over active journal records. Refunds are subtracted. */
export interface PaymentTotals {
  paidAmount: Prisma.Decimal;
  cashAmount: Prisma.Decimal;
  cardAmount: Prisma.Decimal;
  refundedAmount: Prisma.Decimal;
  hasRecords: boolean;
}
