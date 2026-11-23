import { RoundingCalculator } from '../engine/calculators/rounding.calculator.js';
import { RoundingMode } from '../engine/enums/rounding-mode.enum.js';
import { PRICE_MAX_MINOR } from '../constants/price-level-fill.constants.js';
import { PriceLevelFillMode } from '../enums/price-level-fill-mode.enum.js';
import { PriceLevelFillPrice } from '../interfaces/price-level-fill-price.interface.js';
import { PriceLevelFillSpec } from '../interfaces/price-level-fill-spec.interface.js';

/**
 * Level price a bulk fill gives a service with this base price (minor units): base plus a
 * signed percent or amount, rounded to the nearest step. A price that comes out at zero or
 * below, also after rounding, is invalid. PERCENT is half-up on the magnitude, as surcharges.
 */
export function levelFillPrice(
  basePrice: number,
  spec: PriceLevelFillSpec,
): PriceLevelFillPrice {
  if (spec.mode === PriceLevelFillMode.BASE)
    return { price: null, invalid: false };
  const delta =
    spec.mode === PriceLevelFillMode.PERCENT
      ? Math.sign(spec.value) *
        RoundingCalculator.percent(basePrice, Math.abs(spec.value))
      : spec.value;
  const raw = basePrice + delta;
  if (raw > PRICE_MAX_MINOR) return { price: PRICE_MAX_MINOR, invalid: true };
  const price = RoundingCalculator.round(raw, spec.step, RoundingMode.NEAREST);
  return { price, invalid: price <= 0 || price > PRICE_MAX_MINOR };
}
