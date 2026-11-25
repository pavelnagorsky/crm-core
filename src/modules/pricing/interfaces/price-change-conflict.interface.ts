/** A scheduled change that shares a target and a date with a new one. */
export interface PriceChangeConflict {
  changeId: string;
  title: string;
  /** YYYY-MM-DD */
  effectiveDate: string;
  serviceIds: string[];
  bundleIds: string[];
}
