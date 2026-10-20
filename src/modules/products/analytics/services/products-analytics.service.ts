import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { BookingsAggregatesService } from '../../../bookings/aggregates/services/bookings-aggregates.service.js';
import { ResolvedBrandRange } from '../../../dashboard/interfaces/resolved-brand-range.interface.js';
import { DashboardRangeService } from '../../../dashboard/services/dashboard-range.service.js';
import { OrdersAggregatesService } from '../../../orders/aggregates/services/orders-aggregates.service.js';
import { ProductsAnalyticsRequestDto } from '../dto/products-analytics-request.dto.js';
import { ProductsAnalyticsWidgetKey } from '../enums/products-analytics-widget-key.enum.js';
import { ProductsAnalyticsContext } from '../interfaces/products-analytics-context.interface.js';

@Injectable()
export class ProductsAnalyticsService {
  constructor(
    private readonly rangeService: DashboardRangeService,
    private readonly ordersAggregates: OrdersAggregatesService,
    private readonly bookingsAggregates: BookingsAggregatesService,
  ) {}

  async getAnalytics(
    brandId: string,
    dto: ProductsAnalyticsRequestDto,
  ): Promise<ProductsAnalyticsContext> {
    const range = await this.rangeService.resolveForBrand(
      brandId,
      dto,
      dto.locationIds,
    );
    return this.buildContext(dto, range);
  }

  private async buildContext(
    dto: ProductsAnalyticsRequestDto,
    range: ResolvedBrandRange,
  ): Promise<ProductsAnalyticsContext> {
    const compare = range.compareWithPrevious;
    const needsRevenueShare = dto.keys.includes(
      ProductsAnalyticsWidgetKey.PRODUCT_REVENUE_SHARE,
    );
    const currentRevenueRange = {
      locationIds: range.locationIds,
      from: range.from,
      to: range.to,
      staffId: dto.staffId,
    };
    const previousRevenueRange = {
      ...currentRevenueRange,
      from: range.previousFrom,
      to: range.previousTo,
    };
    const revenueSeriesRange = {
      ...currentRevenueRange,
      granularity: range.granularity,
      timezone: range.timezone,
    };
    const productFilters = {
      catalogItemId: dto.productId,
      categoryId: dto.categoryId,
    };
    const current = { ...currentRevenueRange, ...productFilters };
    const previous = { ...previousRevenueRange, ...productFilters };
    const currentSeriesRange = { ...revenueSeriesRange, ...productFilters };
    const needsAllProductRevenue =
      needsRevenueShare && !!(dto.productId || dto.categoryId);

    const [
      currentProductSnapshot,
      previousProductSnapshot,
      currentProductSeries,
      currentServiceSnapshot,
      previousServiceSnapshot,
      currentServiceSeries,
      currentAllProductRevenue,
      previousAllProductRevenue,
      currentAllProductSeries,
    ] = await Promise.all([
      this.ordersAggregates.productSalesKpiSnapshot(current),
      compare
        ? this.ordersAggregates.productSalesKpiSnapshot(previous)
        : Promise.resolve(undefined),
      this.ordersAggregates.productSalesKpiSeries(currentSeriesRange),
      needsRevenueShare
        ? this.bookingsAggregates.snapshot(currentRevenueRange)
        : Promise.resolve(undefined),
      needsRevenueShare && compare
        ? this.bookingsAggregates.snapshot(previousRevenueRange)
        : Promise.resolve(undefined),
      needsRevenueShare
        ? this.bookingsAggregates.series(
            {
              ...revenueSeriesRange,
              statuses: [BookingStatus.COMPLETED],
            },
            false,
          )
        : Promise.resolve([]),
      needsAllProductRevenue
        ? this.ordersAggregates.productRevenue(currentRevenueRange)
        : Promise.resolve(undefined),
      needsAllProductRevenue && compare
        ? this.ordersAggregates.productRevenue(previousRevenueRange)
        : Promise.resolve(undefined),
      needsAllProductRevenue
        ? this.ordersAggregates.productSalesSeries(revenueSeriesRange)
        : Promise.resolve(undefined),
    ]);

    return {
      range,
      currentProductSnapshot,
      previousProductSnapshot,
      currentProductSeries,
      currentServiceSnapshot,
      previousServiceSnapshot,
      currentServiceSeries,
      currentAllProductRevenue:
        currentAllProductRevenue ?? currentProductSnapshot.revenue,
      previousAllProductRevenue:
        previousAllProductRevenue ?? previousProductSnapshot?.revenue,
      currentAllProductSeries: currentAllProductSeries ?? currentProductSeries,
    };
  }
}
