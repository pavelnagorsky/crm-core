import { DiscountCandidate } from './discount-candidate.interface.js';
import { PromotionSkip } from './promotion-skip.interface.js';

/** Discounts that apply to a line (best first) and the targeted promotions that do not. */
export interface LineDiscountOptions {
  eligible: DiscountCandidate[];
  ineligible: PromotionSkip[];
}
