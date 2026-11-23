/** How a bulk fill sets the prices of a level (docs/pricing-stage3-api.md). */
export enum PriceLevelFillMode {
  /** Base price plus or minus a percent. */
  PERCENT = 'PERCENT',
  /** Base price plus or minus an amount. */
  AMOUNT = 'AMOUNT',
  /** Clears the level prices: the base price applies. */
  BASE = 'BASE',
}
