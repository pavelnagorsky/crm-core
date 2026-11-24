import { Prisma } from '@prisma/client';

/** A public slot start with the visit price and the staff the "any staff" rule assigns there. */
export interface PricedSlot {
  /** HH:mm in the location timezone. */
  time: string;
  /** Visit total at this time, discounts included. */
  price: Prisma.Decimal;
  /** Price without the promotions shown as such; null when none applies. */
  listPrice: Prisma.Decimal | null;
  /** The shown promotion of the slot (the first one when lines differ). */
  promotionId: string | null;
  /** Assigned staff ids in the order of the visit items. */
  staffIds: string[];
}
