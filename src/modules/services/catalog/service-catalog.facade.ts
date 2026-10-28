import { HttpStatus, Injectable } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCategoriesService } from '../categories/services/service-categories.service.js';
import { SERVICE_CATALOG_CACHE } from './cache/service-catalog.cache.js';
import { ServiceCatalogCountsRequestDto } from './dto/service-catalog-counts-request.dto.js';
import { ServiceCatalogSearchRequestDto } from './dto/service-catalog-search-request.dto.js';
import { BookingCatalogSnapshot } from './interfaces/booking-catalog-snapshot.interface.js';
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
    private readonly locations: LocationService,
    private readonly cache: AppCacheService,
  ) {}

  async loadForBooking(locationId: string): Promise<BookingServiceCatalog> {
    const { brandId } = await this.locations.getBookingSettings(locationId);
    const snapshot = await this.cache.getOrLoad(
      SERVICE_CATALOG_CACHE,
      { brandId, locationId },
      () => this.loadSnapshot(locationId),
    );
    const services = snapshot.services.filter(
      (service) => service.status === ServiceStatus.ACTIVE,
    );
    const byId = new Map(
      snapshot.services.map((service) => [service.id, service]),
    );
    const bundles = snapshot.bundles.map((bundle) => ({
      ...bundle,
      items: bundle.items.map((item) => ({
        ...item,
        service: byId.get(item.serviceId)!,
      })),
    }));
    return {
      categories: snapshot.categories.map((category) => ({
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

  private async loadSnapshot(
    locationId: string,
  ): Promise<BookingCatalogSnapshot> {
    const [categories, services, bundles] = await Promise.all([
      this.categories.listForBooking(locationId),
      this.services.listActiveForBooking(locationId),
      this.bundles.listActiveForBooking(locationId),
    ]);
    const byId = new Map(services.map((service) => [service.id, service]));
    for (const bundle of bundles)
      for (const item of bundle.items) {
        if (!byId.has(item.serviceId)) byId.set(item.serviceId, item.service);
      }
    return {
      categories,
      services: [...byId.values()],
      bundles: bundles.map((bundle) => ({
        ...bundle,
        items: bundle.items.map(({ serviceId, sortOrder }) => ({
          serviceId,
          sortOrder,
        })),
      })),
    };
  }

  async resolveServicesForAvailability(
    locationId: string,
    serviceIds: string[],
  ) {
    const { services } = await this.loadForBooking(locationId);
    const byId = new Map(services.map((service) => [service.id, service]));
    if (serviceIds.some((id) => !byId.has(id)))
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return serviceIds.map((id) => byId.get(id)!);
  }

  async resolveBundleForAvailability(locationId: string, bundleId: string) {
    const { bundles } = await this.loadForBooking(locationId);
    const bundle = bundles.find((item) => item.id === bundleId);
    if (!bundle)
      throw new AppException(
        ErrorCode.BOOKING_BUNDLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return bundle;
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
