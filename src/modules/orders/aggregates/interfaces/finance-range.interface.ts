/** Days of one location as UTC bounds. */
export interface FinanceRange {
  locationId: string;
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}
