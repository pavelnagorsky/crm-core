import { Prisma, ProductUnit } from '@prisma/client';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { ProductLinePrice } from '../../pricing/interfaces/product-line-price.interface.js';

/** A priced product line of a preview, with what the cabinet shows next to it. */
export interface ProductPricingLineView {
  orderItemId: string | null;
  productId: string;
  productLocationId: string;
  title: string;
  sku: string | null;
  unit: ProductUnit;
  quantity: Prisma.Decimal;
  sellerStaffId: string | null;
  price: ProductLinePrice;
  /** The choice the line was priced with; null = AUTO. */
  promotion: LineDiscountChoice | null;
  /** Null without receipts, or when the caller may not see purchase prices. */
  lastPurchaseUnitCost: Prisma.Decimal | null;
  /** lineTotal below the last purchase price of the quantity. */
  belowCost: boolean;
}
