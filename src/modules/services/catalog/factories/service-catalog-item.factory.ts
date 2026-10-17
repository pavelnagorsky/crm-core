import { Injectable } from '@nestjs/common';
import { BookingExecutionMode } from '../../../bookings/enums/booking-execution-mode.enum.js';
import { BundlePricingMode } from '../../enums/bundle-pricing-mode.enum.js';
import { ServiceCatalogKind } from '../../enums/service-catalog-kind.enum.js';
import { BundleMetrics } from '../../utils/bundle-metrics.js';
import { ServiceBundleForCatalog } from '../interfaces/service-bundle-for-catalog.interface.js';
import { ServiceCatalogBundleItem } from '../interfaces/service-catalog-bundle-item.interface.js';
import { ServiceCatalogServiceItem } from '../interfaces/service-catalog-service-item.interface.js';
import { ServiceForCatalog } from '../interfaces/service-for-catalog.interface.js';

@Injectable()
export class ServiceCatalogItemFactory {
  fromService(service: ServiceForCatalog): ServiceCatalogServiceItem {
    return {
      id: service.id,
      kind: ServiceCatalogKind.SERVICE,
      locationId: service.locationId,
      categoryId: service.categoryId,
      categoryName: service.category?.name ?? null,
      imageFile: service.imageFile,
      title: service.title,
      description: service.description,
      price: service.price,
      durationMinutes: service.durationMinutes,
      status: service.status,
      sortOrder: service.sortOrder,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
      bufferMinutes: service.bufferMinutes,
      hasNoStaff: service._count.staffServices === 0,
    };
  }

  fromBundle(bundle: ServiceBundleForCatalog): ServiceCatalogBundleItem {
    return {
      id: bundle.id,
      kind: ServiceCatalogKind.BUNDLE,
      locationId: bundle.locationId,
      categoryId: bundle.categoryId,
      categoryName: bundle.category?.name ?? null,
      imageFile: bundle.imageFile,
      title: bundle.title,
      description: bundle.description,
      price: BundleMetrics.price(bundle),
      durationMinutes: BundleMetrics.durationMinutes(bundle),
      status: bundle.status,
      sortOrder: bundle.sortOrder,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
      executionMode: bundle.executionMode as BookingExecutionMode,
      pricingMode: bundle.pricingMode as BundlePricingMode,
      fixedPrice: bundle.fixedPrice,
      itemsCount: bundle.items.length,
      itemTitles: bundle.items.map((item) => item.service.title),
      items: bundle.items.map((item) => ({
        serviceId: item.serviceId,
        serviceTitle: item.service.title,
        sortOrder: item.sortOrder,
      })),
    };
  }
}
