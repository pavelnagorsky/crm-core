import { Prisma } from '@prisma/client';

/** Promotion results of one staff member. */
export interface PromotionReportStaff {
  staffId: string;
  name: string;
  avatarUrl: string | null;
  bookingsCount: number;
  revenue: Prisma.Decimal;
  discount: Prisma.Decimal;
}
