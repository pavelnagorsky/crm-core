import { PriceLevelFillMode } from '../enums/price-level-fill-mode.enum.js';

/** A parsed bulk fill: value in hundredths (basis points for PERCENT, minor units for AMOUNT). */
export interface PriceLevelFillSpec {
  mode: PriceLevelFillMode;
  /** Signed; 0 for BASE. */
  value: number;
  /** Rounding step in minor units; 1 = none. */
  step: number;
}
