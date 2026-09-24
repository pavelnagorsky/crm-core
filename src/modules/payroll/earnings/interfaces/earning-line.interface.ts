import { Prisma, StaffEarningType } from '@prisma/client';

export interface EarningLine {
  id?: string;
  type: StaffEarningType;
  amount: Prisma.Decimal | string | number;
  reversesEarningId?: string | null;
  earnedOn?: Date;
}
