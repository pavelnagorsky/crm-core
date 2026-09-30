import { Prisma } from '@prisma/client';

export interface StaffCount {
  staffId: string;
  staffName: string;
  count: number;
  revenue: Prisma.Decimal;
}
