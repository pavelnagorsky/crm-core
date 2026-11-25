import { BundlePricingMode, Prisma, ServiceStatus } from '@prisma/client';

/** A bundle of the price catalog, in any status. */
export interface ServicePriceCatalogBundle {
  id: string;
  title: string;
  categoryId: string | null;
  sortOrder: number;
  pricingMode: BundlePricingMode;
  fixedPrice: Prisma.Decimal | null;
  status: ServiceStatus;
}
