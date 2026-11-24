import { DiscountCandidate } from './discount-candidate.interface.js';
import { PriceAdjustment } from './price-adjustment.interface.js';
import { PromotionSkip } from './promotion-skip.interface.js';

/**
 * Price layers of one line (docs/pricing-plan.md 2.1), in integer minor units:
 * basePrice -> staffPrice -> listPrice -> chargedPrice = listPrice - discountTotal;
 * total = customPrice ?? chargedPrice.
 */
export interface LineQuote {
  serviceId: string;
  basePrice: number;
  staffPrice: number;
  listPrice: number;
  discountTotal: number;
  chargedPrice: number;
  customPrice: number | null;
  total: number;
  adjustments: PriceAdjustment[];
  /** The PROMOTION or CLIENT_DISCOUNT layer of adjustments; null without a discount. */
  discount: PriceAdjustment | null;
  /**
   * Discounts that apply, best first (the order AUTO picks from). A FIXED bundle line
   * carries the package candidates. Empty without a quote context or with a custom price.
   */
  eligible: DiscountCandidate[];
  /** Enabled promotions that target the line but do not apply, in display order. */
  ineligible: PromotionSkip[];
}
