import { Prisma } from '@prisma/client';
import { PromoCodeResult } from '../engine/interfaces/promo-code-result.interface.js';
import { ServiceLinePrice } from './service-line-price.interface.js';

export interface ServicePriceQuote {
  /** In request order. */
  lines: ServiceLinePrice[];
  /** Sum of line list prices. */
  listTotal: Prisma.Decimal;
  /** Discounts of lines without a custom price. */
  discountTotal: Prisma.Decimal;
  /** What the client pays: sum of customPrice ?? chargedPrice. */
  total: Prisma.Decimal;
  /** Null when the request had no promo code. */
  promoCode: PromoCodeResult | null;
}
