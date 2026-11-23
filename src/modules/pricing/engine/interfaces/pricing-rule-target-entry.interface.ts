import { PriceRuleTargetType } from '../enums/price-rule-target-type.enum.js';

/** One target of a price rule: included, or excluded from "applies to all". */
export interface PricingRuleTargetEntry {
  type: PriceRuleTargetType;
  id: string;
  excluded: boolean;
}
