/** Scheduled product prices for hints; money in minor units, dates YYYY-MM-DD. */
export interface ProductPriceUpcomingView {
  next: {
    effectiveDate: string;
    /** Changes on that date, in creation order. */
    changeIds: string[];
    changesCount: number;
    productsCount: number;
  } | null;
  products: { productId: string; changeId: string; effectiveDate: string; price: number }[];
}
