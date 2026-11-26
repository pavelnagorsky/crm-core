import { Prisma } from '@prisma/client';
import { BookingPromotionLabel } from './booking-promotion-label.interface.js';

/** Lowest and highest price a client can get for one catalog item. */
export interface BookingPriceRange {
  priceFrom: Prisma.Decimal;
  priceTo: Prisma.Decimal;
  /** Catalog items only: the catalog price on the location today, scheduled changes read by date. */
  listPrice?: Prisma.Decimal;
  /**
   * Catalog items in the cabinet setup only: the lowest and the highest price-list price
   * among the staff who perform the item, no surcharges, no promotions.
   */
  listPriceFrom?: Prisma.Decimal;
  listPriceTo?: Prisma.Decimal;
  /** Catalog items only: the promotion label, null without promotions. */
  promotion?: BookingPromotionLabel | null;
}
