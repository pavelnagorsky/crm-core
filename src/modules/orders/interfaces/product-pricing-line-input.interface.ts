import { Prisma } from '@prisma/client';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';

/** One product line to price within its order. */
export interface ProductPricingLineInput {
  productLocationId: string;
  productId: string;
  quantity: Prisma.Decimal;
  customUnitPrice: Prisma.Decimal | null;
  sellerStaffId: string | null;
  /** Null = AUTO. A stored choice carries fallbackToAuto. */
  choice: LineDiscountChoice | null;
}
