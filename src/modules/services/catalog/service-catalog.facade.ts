import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { ServiceCatalogCountsRequestDto } from '../dto/service-catalog-counts-request.dto.js';
import { ServiceCatalogSearchRequestDto } from '../dto/service-catalog-search-request.dto.js';
import { BookingServiceCatalog } from '../interfaces/booking-service-catalog.interface.js';
import { ServiceCatalogCounts } from '../interfaces/service-catalog-counts.interface.js';
import { ServiceCatalogItem } from '../interfaces/service-catalog-item.js';
import { ServicesService } from '../services.service.js';
import { ServiceBundleService } from './service-bundle.service.js';
import { ServiceCatalogReadService } from './service-catalog-read.service.js';

@Injectable()
export class ServiceCatalogFacade {
  constructor(
    private readonly services: ServicesService,
    private readonly bundles: ServiceBundleService,
    private readonly catalog: ServiceCatalogReadService,
  ) {}

  async loadForBooking(locationId: string): Promise<BookingServiceCatalog> {
    const [categories, services, bundles] = await Promise.all([
      this.services.listCategories(locationId),
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
}
