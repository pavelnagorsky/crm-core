export interface ReviewStaffSummary {
  count: number;
  /** One decimal place; null while count < REVIEWS_MIN_FOR_AVERAGE. */
  average: number | null;
}
