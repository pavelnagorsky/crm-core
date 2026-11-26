import { PriceChangeTarget } from '../enums/price-change-target.enum.js';

/** One price set by a scheduled change. Money is in integer minor units. */
export interface PricingPriceChangeItem {
  target: PriceChangeTarget;
  serviceId: string | null;
  levelId: string | null;
  staffId: string | null;
  bundleId: string | null;
  /** PRODUCT: the ProductLocation whose retail price is set. */
  productLocationId: string | null;
  /** Null: drop the level price (as base) or the personal price. Never null for PRODUCT. */
  price: number | null;
}
