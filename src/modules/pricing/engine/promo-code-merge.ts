import { PromoCodeStatus } from './enums/promo-code-status.enum.js';
import { PromoCodeResult } from './interfaces/promo-code-result.interface.js';

const RANK: Record<PromoCodeStatus, number> = {
  [PromoCodeStatus.APPLIED]: 3,
  [PromoCodeStatus.BETTER_APPLIED]: 2,
  [PromoCodeStatus.NOT_APPLICABLE]: 1,
  [PromoCodeStatus.NOT_FOUND]: 0,
};

/**
 * One promo code result for a booking window that priced services and products
 * (docs/pricing-stage7-api.md): APPLIED in either part > BETTER_APPLIED > NOT_APPLICABLE
 * (the services reason when the code did not fit there) > NOT_FOUND. A part without lines
 * gives null and does not take part.
 */
export function mergePromoCodeResults(
  services: PromoCodeResult | null,
  products: PromoCodeResult | null,
): PromoCodeResult | null {
  if (services === null) return products;
  if (products === null) return services;
  // On equal status the services result wins: its NOT_APPLICABLE reason comes first.
  return RANK[products.status] > RANK[services.status] ? products : services;
}
