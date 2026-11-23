/** How a computed price snaps to the location rounding step. */
export enum RoundingMode {
  /** Surcharges and level prices: to the nearest step, half up. */
  NEAREST = 'NEAREST',
  /** Discounts: down, so the client gets no less than promised. */
  DOWN = 'DOWN',
}
