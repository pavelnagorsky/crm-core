/** Catalog service as the engine prices it. Money is in integer minor units. */
export interface PricingServiceEntry {
  id: string;
  /** Base price: the price of the default level. */
  price: number;
  /** Price by non-default level id; a missing level costs the base price. */
  levelPrices: Record<string, number>;
}
