/** Manual edit of the new price of one row. */
export interface PriceChangeOverride {
  key: string;
  /** Minor units; null removes a level or personal price. */
  price: number | null;
}
