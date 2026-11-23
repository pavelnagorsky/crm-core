import { PriceRuleSkipReason } from '../engine/enums/price-rule-skip-reason.enum.js';
import { PriceExplainInterval } from './price-explain-interval.interface.js';

export interface PriceExplainNotApplied {
  ruleId: string;
  name: string;
  reason: PriceRuleSkipReason;
  /** Visit start intervals of the rule; empty: the whole day. */
  intervals: PriceExplainInterval[];
}
