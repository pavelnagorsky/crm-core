import { CompensationSalaryMode, Prisma } from '@prisma/client';

export interface SalaryPlanSlice {
  id: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  fixedSalaryAmount: Prisma.Decimal | string | number | null;
  salaryMode: CompensationSalaryMode;
}
