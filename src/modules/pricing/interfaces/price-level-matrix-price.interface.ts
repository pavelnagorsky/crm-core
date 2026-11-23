import { Prisma } from '@prisma/client';

export interface PriceLevelMatrixPrice {
  levelId: string;
  /** Null: the level has no own price, the base price applies. */
  price: Prisma.Decimal | null;
}
