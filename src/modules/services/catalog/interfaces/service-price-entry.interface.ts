import { Prisma } from '@prisma/client';

/** A service with its base price, in any status: what price screens list. */
export interface ServicePriceEntry {
  id: string;
  title: string;
  price: Prisma.Decimal;
}
