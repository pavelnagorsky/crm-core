import { DiscountCandidate } from './discount-candidate.interface.js';
import { PriceAdjustment } from './price-adjustment.interface.js';
import { PromotionSkip } from './promotion-skip.interface.js';

/**
 * A priced product line, in integer minor units: baseUnitPrice = listUnitPrice (no surcharges
 * on products); listLineTotal = quantity × listUnitPrice (half up); lineSubtotal = quantity ×
 * (customUnitPrice ?? listUnitPrice); lineTotal = lineSubtotal - discountTotal.
 */
export interface ProductLineQuote {
  productLocationId: string;
  productId: string;
  baseUnitPrice: number;
  listUnitPrice: number;
  listLineTotal: number;
  customUnitPrice: number | null;
  lineSubtotal: number;
  /** 0 with a custom price. */
  discountTotal: number;
  lineTotal: number;
  /** Zero or one layer: PROMOTION or CLIENT_DISCOUNT, amount on the line. */
  adjustments: PriceAdjustment[];
  discount: PriceAdjustment | null;
  /** Discounts that apply, best first; chargedPrice is the line total with that discount. */
  eligible: DiscountCandidate[];
  /** Enabled promotions that target the line but do not apply. */
  ineligible: PromotionSkip[];
}
