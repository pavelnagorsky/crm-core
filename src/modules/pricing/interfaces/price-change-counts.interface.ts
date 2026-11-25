export interface PriceChangeCounts {
  services: number;
  bundles: number;
  rows: number;
  /** Rows that are valid and change the price. */
  changed: number;
  invalid: number;
}
