import { PriceRuleKind } from '../enums/price-rule-kind.enum.js';
import { PriceRuleSkipReason } from '../enums/price-rule-skip-reason.enum.js';

/** A price rule that did not reach the visit, and the first reason why. */
export interface PriceRuleNotApplied {
  ruleId: string;
  kind: PriceRuleKind;
  name: string;
  reason: PriceRuleSkipReason;
}
