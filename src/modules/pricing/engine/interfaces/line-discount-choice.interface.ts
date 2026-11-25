import { DiscountChoiceMode } from '../enums/discount-choice-mode.enum.js';

/** Discount an administrator picked for a line. */
export interface LineDiscountChoice {
  mode: DiscountChoiceMode;
  /** RULE only. */
  ruleId?: string | null;
  /**
   * A choice stored with a booking and applied again (docs/pricing-stage5-api.md): when its
   * discount does not apply any more, the line gets the best one (AUTO) instead of a 409.
   */
  fallbackToAuto?: boolean;
}
