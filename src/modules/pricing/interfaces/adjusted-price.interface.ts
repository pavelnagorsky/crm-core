/** A price after a percent or amount change and rounding, minor units. */
export interface AdjustedPrice {
  /** Rounded price; the column maximum when the change overflows it. */
  price: number;
  /** The change goes past the price column maximum. */
  overflow: boolean;
}
