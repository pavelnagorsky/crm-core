import { PricingPriceChangeItem } from './pricing-price-change-item.interface.js';

/** A scheduled price change of the location, as the engine reads it. */
export interface PricingPriceChangeEntry {
  id: string;
  /** Local date (YYYY-MM-DD) the prices apply from. */
  effectiveDate: string;
  items: PricingPriceChangeItem[];
}
