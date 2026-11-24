import { Prisma } from '@prisma/client';
import { BookingPromotionLabel } from './booking-promotion-label.interface.js';

/** Lowest and highest price a client can get for one catalog item. */
export interface BookingPriceRange {
  priceFrom: Prisma.Decimal;
  priceTo: Prisma.Decimal;
  /** Catalog items only: the promotion label, null without promotions. */
  promotion?: BookingPromotionLabel | null;
}
