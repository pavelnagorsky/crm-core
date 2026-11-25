import { PRICE_MAX_MINOR } from '../constants/price-level-fill.constants.js';
import { PriceLevelFillMode } from '../enums/price-level-fill-mode.enum.js';
import { PriceLevelFillPrice } from '../interfaces/price-level-fill-price.interface.js';
import { PriceLevelFillSpec } from '../interfaces/price-level-fill-spec.interface.js';
import { adjustedPrice } from './price-change-value.rules.js';

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
  const { price, overflow } = adjustedPrice(
    basePrice,
    spec.mode === PriceLevelFillMode.PERCENT
      ? { percentBp: spec.value }
      : { amount: spec.value },
    spec.step,
  );
  return {
    price,
    invalid: overflow || price <= 0 || price > PRICE_MAX_MINOR,
  };
}
