import { Prisma } from '@prisma/client';

/** Lowest and highest price a client can get for one catalog item. */
export interface BookingPriceRange {
  priceFrom: Prisma.Decimal;
  priceTo: Prisma.Decimal;
}
