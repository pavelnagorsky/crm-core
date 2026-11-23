import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleRecord } from './price-rule-record.interface.js';
import { PriceRuleTargetView } from './price-rule-target-view.interface.js';

/** A rule as the cabinet shows it: names of the targets and what follows from today's date. */
export interface PriceRuleView {
  rule: PriceRuleRecord;
  targets: PriceRuleTargetView[];
  /** Distinct services the rule can touch. */
  serviceCount: number;
  status: PriceRuleStatus;
  /** Nearest date the rule works, from today of the location; null when none or not enabled. */
  nextDate: string | null;
}
