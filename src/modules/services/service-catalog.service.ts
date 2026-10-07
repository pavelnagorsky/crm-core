import { Injectable } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { BookingExecutionMode } from '../bookings/enums/booking-execution-mode.enum.js';
import { BundleMetrics } from './bundle-metrics.js';
import { ServiceCatalogCountsRequestDto } from './dto/service-catalog-counts-request.dto.js';
import { ServiceCatalogSearchRequestDto } from './dto/service-catalog-search-request.dto.js';
import { BundlePricingMode } from './enums/bundle-pricing-mode.enum.js';
import { ServiceCatalogKind } from './enums/service-catalog-kind.enum.js';
import { ServiceSearchOrderBy } from './enums/service-search-order-by.enum.js';
import { ServiceBundleForCatalog } from './interfaces/service-bundle-for-catalog.interface.js';
import { ServiceCatalogBundleItem } from './interfaces/service-catalog-bundle-item.interface.js';
import { ServiceCatalogCounts } from './interfaces/service-catalog-counts.interface.js';
import { ServiceCatalogItem } from './interfaces/service-catalog-item.js';
import { ServiceCatalogServiceItem } from './interfaces/service-catalog-service-item.interface.js';
import { ServiceFilter } from './interfaces/service-filter.interface.js';
import { ServiceForCatalog } from './interfaces/service-for-catalog.interface.js';
import { ServiceStatusCount } from './interfaces/service-status-count.interface.js';
import { ServiceBundleService } from './service-bundle.service.js';
import { ServicesService } from './services.service.js';
import { BookingServiceCatalog } from './interfaces/booking-service-catalog.interface.js';

const CATALOG_STATUSES = [ServiceStatus.ACTIVE, ServiceStatus.INACTIVE];

@Injectable()
export class ServiceCatalogService {
  constructor(
    private readonly services: ServicesService,
    private readonly bundles: ServiceBundleService,
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

  async search(
    locationId: string,
    dto: ServiceCatalogSearchRequestDto,
  ): Promise<PaginatedResult<ServiceCatalogItem>> {
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy = dto.orderBy ?? ServiceSearchOrderBy.SORT_ORDER;
    // Bundle price and duration come from child services, so both kinds are
    // ordered as one list and only then sliced.
    const items = await this.mergedItems(
      locationId,
      this.toFilter(dto),
      dto.kind,
    );
    items.sort((left, right) => this.compare(left, right, orderBy, direction));

    const totalItems = items.length;
    if (dto.isExport) return { items, totalItems };

    const start = (dto.page - 1) * dto.pageSize;
    return { items: items.slice(start, start + dto.pageSize), totalItems };
  }

  async getCounts(
    locationId: string,
    dto: ServiceCatalogCountsRequestDto,
  ): Promise<ServiceCatalogCounts> {
    const textAndCategory: ServiceFilter = {
      search: dto.search,
      categoryId: dto.categoryId,
    };
    const withStatus: ServiceFilter = {
      ...textAndCategory,
      status: dto.status,
    };
    const [byStatus, serviceCount, bundleCount] = await Promise.all([
      this.countByStatus(locationId, textAndCategory, dto.kind),
      this.services.countForCatalog(locationId, withStatus),
      this.bundles.countForCatalog(locationId, withStatus),
    ]);

    return {
      total: this.totalForKind(dto.kind, serviceCount, bundleCount),
      byStatus: this.withEveryStatus(byStatus),
      byKind: [
        { kind: ServiceCatalogKind.SERVICE, count: serviceCount },
        { kind: ServiceCatalogKind.BUNDLE, count: bundleCount },
      ],
    };
  }

  private async mergedItems(
    locationId: string,
    filter: ServiceFilter,
    kind?: ServiceCatalogKind,
  ): Promise<ServiceCatalogItem[]> {
    const [services, bundles] = await Promise.all([
      this.wantsServices(kind)
        ? this.services.listForCatalog(locationId, filter)
        : [],
      this.wantsBundles(kind)
        ? this.bundles.listForCatalog(locationId, filter)
        : [],
    ]);
    return [
      ...services.map((service) => this.fromService(service)),
      ...bundles.map((bundle) => this.fromBundle(bundle)),
    ];
  }

  private async countByStatus(
    locationId: string,
    filter: ServiceFilter,
    kind?: ServiceCatalogKind,
  ): Promise<ServiceStatusCount[]> {
    const [serviceRows, bundleRows] = await Promise.all([
      this.wantsServices(kind)
        ? this.services.countByStatusForCatalog(locationId, filter)
        : [],
      this.wantsBundles(kind)
        ? this.bundles.countByStatusForCatalog(locationId, filter)
        : [],
    ]);
    const merged = new Map<ServiceStatus, number>();
    for (const row of [...serviceRows, ...bundleRows]) {
      merged.set(row.status, (merged.get(row.status) ?? 0) + row.count);
    }
    return [...merged.entries()].map(([status, count]) => ({ status, count }));
  }

  private withEveryStatus(rows: ServiceStatusCount[]): ServiceStatusCount[] {
    const byStatus = new Map(rows.map((row) => [row.status, row.count]));
    return CATALOG_STATUSES.map((status) => ({
      status,
      count: byStatus.get(status) ?? 0,
    }));
  }

  private totalForKind(
    kind: ServiceCatalogKind | undefined,
    serviceCount: number,
    bundleCount: number,
  ): number {
    if (kind === ServiceCatalogKind.SERVICE) return serviceCount;
    if (kind === ServiceCatalogKind.BUNDLE) return bundleCount;
    return serviceCount + bundleCount;
  }

  private wantsServices(kind?: ServiceCatalogKind): boolean {
    return kind !== ServiceCatalogKind.BUNDLE;
  }

  private wantsBundles(kind?: ServiceCatalogKind): boolean {
    return kind !== ServiceCatalogKind.SERVICE;
  }

  private toFilter(dto: ServiceFilter): ServiceFilter {
    return {
      search: dto.search,
      categoryId: dto.categoryId,
      status: dto.status,
    };
  }

  private fromService(service: ServiceForCatalog): ServiceCatalogServiceItem {
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

  private fromBundle(
    bundle: ServiceBundleForCatalog,
  ): ServiceCatalogBundleItem {
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

  private compare(
    left: ServiceCatalogItem,
    right: ServiceCatalogItem,
    orderBy: ServiceSearchOrderBy,
    direction: OrderDirection,
  ): number {
    const sign = direction === OrderDirection.DESC ? -1 : 1;
    const primary =
      orderBy === ServiceSearchOrderBy.CATEGORY
        ? this.compareCategory(left.categoryName, right.categoryName, sign)
        : this.compareValues(left, right, orderBy) * sign;
    if (primary !== 0) return primary;
    return left.id.localeCompare(right.id) * sign;
  }

  private compareValues(
    left: ServiceCatalogItem,
    right: ServiceCatalogItem,
    orderBy: ServiceSearchOrderBy,
  ): number {
    switch (orderBy) {
      case ServiceSearchOrderBy.TITLE:
        return left.title.localeCompare(right.title, 'ru');
      case ServiceSearchOrderBy.DURATION_MINUTES:
        return left.durationMinutes - right.durationMinutes;
      case ServiceSearchOrderBy.PRICE:
        return left.price.comparedTo(right.price);
      case ServiceSearchOrderBy.STATUS:
        return left.status.localeCompare(right.status);
      case ServiceSearchOrderBy.CREATED_AT:
        return left.createdAt.getTime() - right.createdAt.getTime();
      case ServiceSearchOrderBy.SORT_ORDER:
      default:
        return left.sortOrder - right.sortOrder;
    }
  }

  private compareCategory(
    left: string | null,
    right: string | null,
    sign: number,
  ): number {
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return left.localeCompare(right, 'ru') * sign;
  }
}
