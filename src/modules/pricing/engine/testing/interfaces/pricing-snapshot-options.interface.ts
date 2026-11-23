import { PricingBundleEntry } from '../../interfaces/pricing-bundle-entry.interface.js';
import { PricingLevelEntry } from '../../interfaces/pricing-level-entry.interface.js';
import { PricingRuleEntry } from '../../interfaces/pricing-rule-entry.interface.js';
import { PricingStaffEntry } from '../../interfaces/pricing-staff-entry.interface.js';

export interface PricingSnapshotOptions {
  /** Catalog price of each service, by id, in minor units. */
  services?: Record<string, number>;
  bundles?: PricingBundleEntry[];
  levels?: PricingLevelEntry[];
  staff?: PricingStaffEntry[];
  /** Level prices by service id, then level id, in minor units. */
  levelPrices?: Record<string, Record<string, number>>;
  /** Category id by service id; missing = uncategorized. */
  categories?: Record<string, string>;
  rules?: PricingRuleEntry[];
  /** Rounding step in minor units; 100 (1.00, the location default) when omitted. */
  roundingStep?: number;
}
