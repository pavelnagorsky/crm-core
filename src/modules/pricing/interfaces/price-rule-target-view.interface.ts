import { PriceRuleTargetRef } from './price-rule-target-ref.interface.js';

export interface PriceRuleTargetView extends PriceRuleTargetRef {
  /** Current title of the service, category or bundle; null when it is gone. */
  name: string | null;
}
