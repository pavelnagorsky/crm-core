import { Prisma } from '@prisma/client';
import { ProductUnit } from '../engine/enums/product-unit.enum.js';

/** A confirmed product line of a separate sale, to count what a draft promotion would have matched. */
export interface PromotionSaleLine {
  orderId: string;
  productId: string;
  productCategoryId: string | null;
  unit: ProductUnit;
  quantity: Prisma.Decimal;
  listUnitPrice: Prisma.Decimal;
  sellerStaffId: string | null;
  /** The sale moment of the line. */
  confirmedAt: Date;
}
