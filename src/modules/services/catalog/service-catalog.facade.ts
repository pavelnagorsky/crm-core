import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { ServiceCategoriesService } from '../categories/services/service-categories.service.js';
import { ServiceCatalogCountsRequestDto } from './dto/service-catalog-counts-request.dto.js';
import { ServiceCatalogSearchRequestDto } from './dto/service-catalog-search-request.dto.js';
import { BookingServiceCatalog } from './interfaces/booking-service-catalog.interface.js';
import { ServiceBundleView } from './interfaces/service-bundle-view.interface.js';
import { ServiceCatalogCounts } from './interfaces/service-catalog-counts.interface.js';
import { ServiceCatalogItem } from './interfaces/service-catalog-item.js';
import { ServiceFilter } from './interfaces/service-filter.interface.js';
import { ServiceWithImage } from './interfaces/service-with-image.interface.js';
import { ServiceWithStaffCount } from './interfaces/service-with-staff-count.interface.js';
import { ServiceBundleReadService } from './services/service-bundle-read.service.js';
import { ServiceCatalogReadService } from './services/service-catalog-read.service.js';
import { ServiceReadService } from './services/service-read.service.js';

@Injectable()
export class ServiceCatalogFacade {
  constructor(
    private readonly services: ServiceReadService,
    private readonly bundles: ServiceBundleReadService,
    private readonly catalog: ServiceCatalogReadService,
    private readonly categories: ServiceCategoriesService,
  ) {}

  async loadForBooking(locationId: string): Promise<BookingServiceCatalog> {
    const [categories, services, bundles] = await Promise.all([
      this.categories.listCategories(locationId),
      this.services.listActiveForBooking(locationId),
      this.bundles.listActiveForBooking(locationId),
    ]);
    return {
      categories: categories.map((category) => ({
        ...category,
        services: services.filter(
          (service) => service.categoryId === category.id,
        ),
        bundles: bundles.filter((bundle) => bundle.categoryId === category.id),
      })),
      services,
      bundles,
    };
  }

  search(
    locationId: string,
    dto: ServiceCatalogSearchRequestDto,
  ): Promise<PaginatedResult<ServiceCatalogItem>> {
    return this.catalog.search(locationId, dto);
  }

  getCounts(
    locationId: string,
    dto: ServiceCatalogCountsRequestDto,
  ): Promise<ServiceCatalogCounts> {
    return this.catalog.counts(locationId, dto);
  }

  findServiceById(
    locationId: string,
    serviceId: string,
  ): Promise<ServiceWithStaffCount> {
    return this.services.findById(locationId, serviceId);
  }

  findBundleById(
    locationId: string,
    bundleId: string,
  ): Promise<ServiceBundleView> {
    return this.bundles.findById(locationId, bundleId);
  }

  resolveServicesForBooking(
    locationId: string,
    serviceIds: string[],
  ): Promise<ServiceWithImage[]> {
    return this.services.resolveActiveForBooking(locationId, serviceIds);
  }

  resolveBundleForBooking(
    locationId: string,
    bundleId: string,
  ): Promise<ServiceBundleView> {
    return this.bundles.resolveActiveForBooking(locationId, bundleId);
  }

  assertServiceIdsInLocation(
    locationId: string,
    serviceIds: string[],
  ): Promise<void> {
    return this.services.assertIdsInLocation(locationId, serviceIds);
  }

  findServiceIdsByFilter(
    locationId: string,
    filter: ServiceFilter,
  ): Promise<string[]> {
    return this.services.findIdsByFilter(locationId, filter);
  }

  countBookableServices(locationId: string): Promise<number> {
    return this.services.countBookable(locationId);
  }
}
