import { PriceRuleSkipReason } from '../enums/price-rule-skip-reason.enum.js';

/** A surcharge rule that did not reach the visit, and the first reason why. */
export interface PriceRuleNotApplied {
  ruleId: string;
  name: string;
  reason: PriceRuleSkipReason;
}
