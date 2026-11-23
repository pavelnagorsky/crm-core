/** The catalog as far as rule coverage needs it. */
export interface PriceRuleCatalogCoverage {
  services: { id: string; categoryId: string | null }[];
  bundles: { id: string; serviceIds: string[] }[];
}
