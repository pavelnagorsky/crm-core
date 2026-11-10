export interface ReviewSummary {
  count: number;
  /** One decimal place; null while count < REVIEWS_MIN_FOR_AVERAGE. */
  average: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}
