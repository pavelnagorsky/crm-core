/** The ids a rule scope is chosen from. */
export interface PriceChangeScopeCatalog {
  services: { id: string; categoryId: string | null }[];
  /** Bundles in any pricing mode; only FIXED ones carry a price. */
  bundles: { id: string; categoryId: string | null; fixed: boolean }[];
}
