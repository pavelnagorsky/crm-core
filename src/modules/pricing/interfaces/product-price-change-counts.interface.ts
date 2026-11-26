/** Totals of a product price change preview. */
export interface ProductPriceChangeCounts {
  products: number;
  rows: number;
  changed: number;
  invalid: number;
  belowCost: number;
}
