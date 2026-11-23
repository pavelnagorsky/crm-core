import { Prisma } from '@prisma/client';

/** What the price engine needs to know about an active staff member. */
export interface StaffPricingProfile {
  id: string;
  name: string;
  /** Null: the default price level. */
  priceLevelId: string | null;
  /** Personal prices only: services where the staff member has no own price are absent. */
  servicePrices: { serviceId: string; price: Prisma.Decimal }[];
}
