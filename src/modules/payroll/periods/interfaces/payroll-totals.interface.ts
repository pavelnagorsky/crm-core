import { Prisma } from '@prisma/client';

export interface PayrollTotals {
  fixedSalaryTotal: Prisma.Decimal;
  hourlyTotal: Prisma.Decimal;
  serviceCommissionTotal: Prisma.Decimal;
  productCommissionTotal: Prisma.Decimal;
  bonusTotal: Prisma.Decimal;
  deductionTotal: Prisma.Decimal;
  correctionTotal: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  earningsCount: number;
}
