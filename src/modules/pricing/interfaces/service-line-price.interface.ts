import { Prisma } from '@prisma/client';
import { PromotionSkip } from '../engine/interfaces/promotion-skip.interface.js';
import { ServiceDiscountOption } from './service-discount-option.interface.js';
import { ServicePriceAdjustment } from './service-price-adjustment.interface.js';

/**
 * Price layers of one service line (docs/pricing-plan.md 2.1):
 * basePrice -> staffPrice -> listPrice -> chargedPrice = listPrice - discountTotal.
 * What the client pays is customPrice ?? chargedPrice.
 */
export interface ServiceLinePrice {
  serviceId: string;
  basePrice: Prisma.Decimal;
  staffPrice: Prisma.Decimal;
  listPrice: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  chargedPrice: Prisma.Decimal;
  customPrice: Prisma.Decimal | null;
  adjustments: ServicePriceAdjustment[];
  /** The PROMOTION or CLIENT_DISCOUNT layer of adjustments, or null. */
  discount: ServicePriceAdjustment | null;
  /** Discounts that apply, best first (a FIXED bundle: of the package). */
  eligible: ServiceDiscountOption[];
  /** Enabled promotions that target the line but do not apply. */
  ineligible: PromotionSkip[];
}
