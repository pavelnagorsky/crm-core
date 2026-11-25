import { RoundingCalculator } from '../engine/calculators/rounding.calculator.js';
import { RoundingMode } from '../engine/enums/rounding-mode.enum.js';
import { PRICE_MAX_MINOR } from '../constants/price-level-fill.constants.js';
import { AdjustedPrice } from '../interfaces/adjusted-price.interface.js';

/**
 * A price plus a signed percent (basis points, half-up on the magnitude) or a signed amount
 * (minor units), rounded to the nearest step. Shared by the level bulk fill and the price
 * change rules. A result below zero comes out as 0; the caller decides what 0 means.
 */
export function adjustedPrice(
  basePrice: number,
  change: { percentBp: number } | { amount: number },
  step: number,
): AdjustedPrice {
  const delta =
    'percentBp' in change
      ? Math.sign(change.percentBp) *
        RoundingCalculator.percent(basePrice, Math.abs(change.percentBp))
      : change.amount;
  const raw = basePrice + delta;
  if (raw > PRICE_MAX_MINOR) return { price: PRICE_MAX_MINOR, overflow: true };
  return {
    price: RoundingCalculator.round(raw, step, RoundingMode.NEAREST),
    overflow: false,
  };
}
