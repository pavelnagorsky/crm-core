import {
  BookingExecutionMode,
  BundlePricingMode,
  Prisma,
  ServiceStatus,
} from '@prisma/client';
import { BookingCatalogSnapshot } from '../../services/catalog/interfaces/booking-catalog-snapshot.interface.js';
import { CatalogSnapshotOptions } from './interfaces/catalog-snapshot-options.interface.js';

/**
 * Catalog snapshot as ServiceCatalogFacade.loadCatalogSnapshot returns it. Defaults: cut 60.00
 * and color 90.00; a SUM bundle and a FIXED bundle of 120.00 over both.
 */
export function bookingCatalogSnapshot(
  options: CatalogSnapshotOptions = {},
): BookingCatalogSnapshot {
  const services = options.services ?? { cut: '60.00', color: '90.00' };
  const bundles = options.bundles ?? [
    {
      id: 'sum-bundle',
      pricingMode: BundlePricingMode.SUM,
      fixedPrice: null,
      serviceIds: ['cut', 'color'],
    },
    {
      id: 'fixed-bundle',
      pricingMode: BundlePricingMode.FIXED,
      fixedPrice: '120.00',
      serviceIds: ['cut', 'color'],
    },
  ];
  return {
    categories: [],
    services: Object.entries(services).map(([id, price], sortOrder) => ({
      id,
      categoryId: null,
      title: id,
      description: null,
      price: new Prisma.Decimal(price),
      durationMinutes: 60,
      bufferMinutes: 0,
      sortOrder,
      status: ServiceStatus.ACTIVE,
      imageFile: null,
    })),
    bundles: bundles.map((bundle, sortOrder) => ({
      id: bundle.id,
      categoryId: null,
      title: bundle.id,
      description: null,
      pricingMode: bundle.pricingMode,
      fixedPrice:
        bundle.fixedPrice === null
          ? null
          : new Prisma.Decimal(bundle.fixedPrice),
      executionMode: BookingExecutionMode.SEQUENTIAL,
      sortOrder,
      imageFile: null,
      items: bundle.serviceIds.map((serviceId, index) => ({
        serviceId,
        sortOrder: index,
      })),
    })),
  };
}
