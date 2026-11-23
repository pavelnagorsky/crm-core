import { Prisma } from '@prisma/client';
import { PriceLevelMatrixPrice } from './price-level-matrix-price.interface.js';

export interface PriceLevelMatrixRow {
  serviceId: string;
  title: string;
  basePrice: Prisma.Decimal;
  /** One entry per non-default level, in level order. */
  prices: PriceLevelMatrixPrice[];
}
