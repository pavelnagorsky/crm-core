/** Scheduled base and bundle prices for hints; money in minor units, dates YYYY-MM-DD. */
export interface ServicePriceUpcomingView {
  next: {
    effectiveDate: string;
    /** Changes on that date, in creation order. */
    changeIds: string[];
    changesCount: number;
    servicesCount: number;
    bundlesCount: number;
  } | null;
  services: { serviceId: string; changeId: string; effectiveDate: string; price: number }[];
  bundles: { bundleId: string; changeId: string; effectiveDate: string; price: number }[];
}
