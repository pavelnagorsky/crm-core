import { Prisma } from '@prisma/client';
import { ProductUnit } from '../engine/enums/product-unit.enum.js';

/** A product a draft promotion reaches, priced for one unit at the example date. */
export interface PromotionProductExample {
  productId: string;
  productName: string;
  unit: ProductUnit;
  before: Prisma.Decimal;
  after: Prisma.Decimal;
  amount: Prisma.Decimal;
  /** Null without Read(INVENTORY) or without receipts. */
  lastPurchaseUnitCost: Prisma.Decimal | null;
  /** after is below the last purchase cost of one unit. */
  belowCost: boolean;
}
