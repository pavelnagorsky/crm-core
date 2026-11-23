import { Prisma } from '@prisma/client';

/** A public slot start with the visit price and the staff the "any staff" rule assigns there. */
export interface PricedSlot {
  /** HH:mm in the location timezone. */
  time: string;
  /** Visit total at this time. */
  price: Prisma.Decimal;
  /** Assigned staff ids in the order of the visit items. */
  staffIds: string[];
}
