/** Which price kinds beyond the base price a rule changes. */
export interface PriceChangeInclude {
  levelPrices: boolean;
  staffPrices: boolean;
  fixedBundles: boolean;
}
