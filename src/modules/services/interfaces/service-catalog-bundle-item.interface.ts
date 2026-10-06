import { Prisma } from '@prisma/client';
import { BookingExecutionMode } from '../../bookings/enums/booking-execution-mode.enum.js';
import { BundlePricingMode } from '../enums/bundle-pricing-mode.enum.js';
import { ServiceCatalogKind } from '../enums/service-catalog-kind.enum.js';
import { ServiceCatalogBundleServiceItem } from './service-catalog-bundle-service-item.interface.js';
import { ServiceCatalogEntry } from './service-catalog-entry.interface.js';

export interface ServiceCatalogBundleItem extends ServiceCatalogEntry {
  kind: ServiceCatalogKind.BUNDLE;
  executionMode: BookingExecutionMode;
  pricingMode: BundlePricingMode;
  fixedPrice: Prisma.Decimal | null;
  itemsCount: number;
  itemTitles: string[];
  items: ServiceCatalogBundleServiceItem[];
}
