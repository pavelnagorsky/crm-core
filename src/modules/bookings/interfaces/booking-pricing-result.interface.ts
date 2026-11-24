import { Prisma } from '@prisma/client';
import { PromoCodeResult } from '../../pricing/engine/interfaces/promo-code-result.interface.js';
import { BookingPricingLine } from './booking-pricing-line.interface.js';

export interface BookingPricingResult {
  currency: string;
  bundleId: string | null;
  bundleTitle: string | null;
  serviceTotal: Prisma.Decimal;
  productTotal: Prisma.Decimal;
  listTotalAmount: Prisma.Decimal;
  subtotalAmount: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  items: BookingPricingLine[];
  /** Null without a promo code in the request. */
  promoCode: PromoCodeResult | null;
  /** The response shows internal titles and discount menus. */
  cabinet: boolean;
}
