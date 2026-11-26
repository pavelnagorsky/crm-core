/** A scheduled product change as the upcoming hints read it, in creation order within a date. */
export interface ProductPriceUpcomingSource {
  id: string;
  /** YYYY-MM-DD */
  effectiveDate: string;
  items: {
    productLocationId: string | null;
    /** Minor units. */
    afterPrice: number | null;
  }[];
}
