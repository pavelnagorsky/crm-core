import { Prisma } from '@prisma/client';

/** Price of one service for one non-default price level. */
export interface ServiceLevelPriceRow {
  serviceId: string;
  priceLevelId: string;
  price: Prisma.Decimal;
}
