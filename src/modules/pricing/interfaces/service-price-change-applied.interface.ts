/** A change the applier moved into the prices, for the after-commit work. */
export interface ServicePriceChangeApplied {
  changeId: string;
  locationId: string;
  title: string;
  appliedCount: number;
  applySkippedCount: number;
}
