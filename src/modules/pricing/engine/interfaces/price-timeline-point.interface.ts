/** A price that starts on a local date. */
export interface PriceTimelinePoint {
  /** YYYY-MM-DD */
  date: string;
  /** Null: no level price / no personal price. */
  price: number | null;
}
