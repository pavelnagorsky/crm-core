import { Prisma } from '@prisma/client';

/** Personal prices of one staff member for every service they perform. */
export interface StaffServicePrices {
  staffId: string;
  /** Null: the default price level. */
  priceLevelId: string | null;
  items: { serviceId: string; personalPrice: Prisma.Decimal | null }[];
}
