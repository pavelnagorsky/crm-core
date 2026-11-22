import { BundlePricingMode } from '@prisma/client';

export interface CatalogBundleOptions {
  id: string;
  pricingMode: BundlePricingMode;
  /** Decimal string; null for a SUM bundle or a FIXED bundle without a price. */
  fixedPrice: string | null;
  serviceIds: string[];
}
