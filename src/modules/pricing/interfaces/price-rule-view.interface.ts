import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleRecord } from './price-rule-record.interface.js';
import { PriceRuleStaffView } from './price-rule-staff-view.interface.js';
import { PriceRuleTargetView } from './price-rule-target-view.interface.js';

/** A rule as the cabinet shows it: names of the targets and what follows from today's date. */
export interface PriceRuleView {
  rule: PriceRuleRecord;
  targets: PriceRuleTargetView[];
  /** Promotion staff with names; empty for surcharges and "every staff member". */
  staff: PriceRuleStaffView[];
  /** Location currency, for the conditions text. */
  currency: string;
  /** Distinct services the rule can touch. */
  serviceCount: number;
  status: PriceRuleStatus;
  /** Nearest date the rule works, from today of the location; null when none or not enabled. */
  nextDate: string | null;
}
