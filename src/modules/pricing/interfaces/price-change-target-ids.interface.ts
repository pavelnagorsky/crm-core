/** Targets a new change touches, for the date conflict check. */
export interface PriceChangeTargetIds {
  serviceIds?: readonly string[];
  bundleIds?: readonly string[];
  /** Product.id by ProductLocation.id of the product rows. */
  productIds?: ReadonlyMap<string, string>;
}
