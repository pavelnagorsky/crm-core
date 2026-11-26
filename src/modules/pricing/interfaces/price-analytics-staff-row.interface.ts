import { Prisma } from '@prisma/client';

export interface PriceAnalyticsStaffRow {
  /** null: items without a staff member or seller. */
  staffId: string | null;
  name: string | null;
  avatarUrl: string | null;
  bookingsCount: number;
  salesCount: number;
  regular: Prisma.Decimal;
  surcharges: Prisma.Decimal;
  discounts: Prisma.Decimal;
  /** The CUSTOM_PRICE_DOWN part of discounts. */
  customDiscounts: Prisma.Decimal;
  received: Prisma.Decimal;
}
