import { BundlePricingMode } from '../enums/bundle-pricing-mode.enum.js';

/** Catalog bundle as the engine prices it. Money is in integer minor units. */
export interface PricingBundleEntry {
  id: string;
  pricingMode: BundlePricingMode;
  /** Set for FIXED bundles only. */
  fixedPrice: number | null;
  /** Services of the bundle in item order. */
  serviceIds: string[];
}
