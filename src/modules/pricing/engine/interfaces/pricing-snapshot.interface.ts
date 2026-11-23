import { PricingBundleEntry } from './pricing-bundle-entry.interface.js';
import { PricingLevelEntry } from './pricing-level-entry.interface.js';
import { PricingServiceEntry } from './pricing-service-entry.interface.js';
import { PricingStaffEntry } from './pricing-staff-entry.interface.js';

/** Everything the engine needs to price a location, as plain data (cache safe: no Map). */
export interface PricingSnapshot {
  services: PricingServiceEntry[];
  bundles: PricingBundleEntry[];
  levels: PricingLevelEntry[];
  staff: PricingStaffEntry[];
}
