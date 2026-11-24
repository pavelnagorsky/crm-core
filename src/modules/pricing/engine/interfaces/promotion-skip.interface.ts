import { PriceRuleSkipReason } from '../enums/price-rule-skip-reason.enum.js';

/** An enabled promotion that targets a line but does not apply, and the first reason. */
export interface PromotionSkip {
  ruleId: string;
  title: string;
  reason: PriceRuleSkipReason;
}
