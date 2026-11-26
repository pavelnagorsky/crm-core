import { Prisma } from '@prisma/client';
import { PromoCodeResult } from '../../pricing/engine/interfaces/promo-code-result.interface.js';
import { OrderPricingContext } from '../enums/order-pricing-context.enum.js';
import { ProductPricingLineView } from './product-pricing-line-view.interface.js';

/** POST orders/pricing: the draft lines priced, nothing stored. */
export interface OrderPricingPreview {
  currency: string;
  context: OrderPricingContext;
  lines: ProductPricingLineView[];
  listTotalAmount: Prisma.Decimal;
  subtotalAmount: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  promoCode: PromoCodeResult | null;
}
