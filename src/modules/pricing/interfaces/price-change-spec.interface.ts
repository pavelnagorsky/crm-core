import { ServicePriceChangeMode } from '../enums/service-price-change-mode.enum.js';
import { PriceChangeInclude } from './price-change-include.interface.js';

/** A parsed price change rule. Money is in minor units, a percent in basis points. */
export interface PriceChangeSpec {
  allServices: boolean;
  serviceIds: string[];
  categoryIds: string[];
  bundleIds: string[];
  mode: ServicePriceChangeMode;
  /** PERCENT: signed basis points; AMOUNT: signed minor units; SET: new price, null: none. */
  value: number | null;
  /** Rounding step in minor units; 1 = none. */
  step: number;
  include: PriceChangeInclude;
  /** Local date YYYY-MM-DD; null: apply now. */
  effectiveDate: string | null;
}
