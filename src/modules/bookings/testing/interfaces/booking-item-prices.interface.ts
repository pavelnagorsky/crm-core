import { Prisma } from '@prisma/client';

/** Price layers of a booking item fixture: chargedPrice = listPrice - discountTotal. */
export interface BookingItemPrices {
  basePrice: Prisma.Decimal;
  staffPrice: Prisma.Decimal;
  listPrice: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  chargedPrice: Prisma.Decimal;
}
