/** The price a bulk fill gives one service, minor units. */
export interface PriceLevelFillPrice {
  /** Null when the fill clears the price (BASE). */
  price: number | null;
  /** Not above zero, or more than the column holds. */
  invalid: boolean;
}
