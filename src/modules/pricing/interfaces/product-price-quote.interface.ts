import { Prisma } from '@prisma/client';
import { PromoCodeResult } from '../engine/interfaces/promo-code-result.interface.js';
import { ProductLinePrice } from './product-line-price.interface.js';

export interface ProductPriceQuote {
  /** In request order. */
  lines: ProductLinePrice[];
  /** Σ listLineTotal. */
  listTotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  /** Σ lineTotal. */
  total: Prisma.Decimal;
  promoCode: PromoCodeResult | null;
}
