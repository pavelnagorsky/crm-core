import { DiscountChoiceMode } from '../enums/discount-choice-mode.enum.js';

/** Discount an administrator picked for a line. */
export interface LineDiscountChoice {
  mode: DiscountChoiceMode;
  /** RULE only. */
  ruleId?: string | null;
}
