import { ProductUnit } from '../enums/product-unit.enum.js';

/** A product the location sells (retail price set, product for sale), as the engine prices it. */
export interface PricingProductEntry {
  productLocationId: string;
  /** Product.id (the brand product): rule targets point here. */
  productId: string;
  /** ProductCategory.id. */
  categoryId: string | null;
  unit: ProductUnit;
  /** Minor units, the current ProductLocation.retailPrice. */
  retailPrice: number;
}
