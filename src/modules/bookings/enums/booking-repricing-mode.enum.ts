/** What an edit of a booking does with its prices (docs/pricing-stage5-api.md). */
export enum BookingRepricingMode {
  /** Prices stay; only items whose discount is picked again and a changed code re-price. */
  KEEP = 'KEEP',
  /** Every item gets fresh layers at its final staff and time. */
  RECALCULATE = 'RECALCULATE',
}
