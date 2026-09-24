import { CompensationSalaryMode, Prisma } from '@prisma/client';

export interface SalaryProration {
  prorated: Prisma.Decimal;
  planId: string | null;
  mode: CompensationSalaryMode;
  lastSalary: Prisma.Decimal;
  daysCovered: number;
}
