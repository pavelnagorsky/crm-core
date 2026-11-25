import { ServicePriceChangeTarget } from '../enums/service-price-change-target.enum.js';

/** One price set by a scheduled change. Money is in integer minor units. */
export interface PricingPriceChangeItem {
  target: ServicePriceChangeTarget;
  serviceId: string | null;
  levelId: string | null;
  staffId: string | null;
  bundleId: string | null;
  /** Null: drop the level price (as base) or the personal price. */
  price: number | null;
}
