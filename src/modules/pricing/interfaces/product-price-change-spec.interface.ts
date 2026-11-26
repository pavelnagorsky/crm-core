import { PriceChangeMode } from '../enums/price-change-mode.enum.js';

/** A parsed product price change rule. Money is in minor units, a percent in basis points. */
export interface ProductPriceChangeSpec {
  allProducts: boolean;
  productIds: string[];
  categoryIds: string[];
  mode: PriceChangeMode;
  /** PERCENT: signed basis points; AMOUNT: signed minor units; SET: new price, null: none. */
  value: number | null;
  /** Rounding step in minor units; 1 = none. */
  step: number;
  /** Local date YYYY-MM-DD; null: apply now. */
  effectiveDate: string | null;
}
