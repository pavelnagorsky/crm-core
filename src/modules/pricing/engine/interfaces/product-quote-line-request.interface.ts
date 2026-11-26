/** One product line to price (docs/pricing-stage7-api.md). Money in minor units. */
export interface ProductQuoteLineRequest {
  productLocationId: string;
  /** Quantity × 1000, an integer. */
  quantityMilli: number;
  /** Minor units per unit; set: no discount candidates. */
  customUnitPrice: number | null;
  /** The seller: what the "Staff" condition of a promotion checks. */
  sellerStaffId: string | null;
}
