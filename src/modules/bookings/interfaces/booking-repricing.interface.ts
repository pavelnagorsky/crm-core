import { Prisma } from '@prisma/client';

/** New price layers of the items an edit re-prices, and the promo code to store. */
export interface BookingRepricing {
  itemUpdates: Prisma.BookingItemUpdateWithWhereUniqueWithoutBookingInput[];
  /** Ids of the re-priced items: their customPrice is written with the layers. */
  itemIds: string[];
  /** Upper case when its promotion applies, else null. */
  promoCode: string | null;
  /** Promotions the re-priced items use, for the limit check under the lock. */
  ruleIds: string[];
  /** The client the booking is priced for (the one an edit links), for the limit check. */
  clientId: string | null;
  /** Earliest item start: the per-client limit window is counted from it. */
  visitStartAt: Date;
}
