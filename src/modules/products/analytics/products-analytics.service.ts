import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingsAggregatesService } from '../../bookings/aggregates/bookings-aggregates.service.js';
import { SeriesRow } from '../../bookings/interfaces/series-row.interface.js';
import { WidgetDto } from '../../dashboard/dto/widget.dto.js';
import { WidgetMetaDto } from '../../dashboard/dto/widget-meta.dto.js';
import { MetricUnit } from '../../dashboard/enums/metric-unit.enum.js';
import { WidgetKind } from '../../dashboard/enums/widget-kind.enum.js';
import { DashboardBucketService } from '../../dashboard/services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from '../../dashboard/services/dashboard-metric.factory.js';
import { DashboardRangeService } from '../../dashboard/services/dashboard-range.service.js';
import { ProductSalesKpiSeriesRow } from '../../orders/analytics/interfaces/product-sales-kpi-series-row.interface.js';
import { ProductSalesRange } from '../../orders/analytics/interfaces/product-sales-range.interface.js';
import { OrdersAggregatesService } from '../../orders/analytics/orders-aggregates.service.js';
import { ProductsAnalyticsRequestDto } from './dto/products-analytics-request.dto.js';
import { ProductsAnalyticsWidgetKey } from './enums/products-analytics-widget-key.enum.js';
import { ProductsAnalyticsContext } from './interfaces/products-analytics-context.interface.js';

@Injectable()
export class ProductsAnalyticsService {
  constructor(
    private readonly rangeService: DashboardRangeService,
    private readonly ordersAggregates: OrdersAggregatesService,
    private readonly bookingsAggregates: BookingsAggregatesService,
    private readonly metricFactory: DashboardMetricFactory,
    private readonly buckets: DashboardBucketService,
  ) {}

  async getWidgets(
    locationId: string,
    dto: ProductsAnalyticsRequestDto,
  ): Promise<WidgetDto[]> {
    const ctx = await this.buildContext(locationId, dto);
    return dto.keys.map((key) => this.buildWidget(key, ctx));
  }

  private buildWidget(
    key: ProductsAnalyticsWidgetKey,
    ctx: ProductsAnalyticsContext,
  ): WidgetDto {
    switch (key) {
      case ProductsAnalyticsWidgetKey.GROSS_PROFIT:
        return this.grossProfit(key, ctx);
      case ProductsAnalyticsWidgetKey.PRODUCT_REVENUE_SHARE:
        return this.productRevenueShare(key, ctx);
      case ProductsAnalyticsWidgetKey.REPEAT_PURCHASE_RATE:
        return this.repeatPurchaseRate(key, ctx);
      default: {
        const _exhaustive: never = key;
        throw new Error(
          `Unhandled products-analytics widget key: ${_exhaustive}`,
        );
      }
    }
  }

  private grossProfit(
    key: ProductsAnalyticsWidgetKey,
    ctx: ProductsAnalyticsContext,
  ): WidgetDto {
    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value: money(ctx.currentProductSnapshot.grossProfit),
        previousValue: ctx.previousProductSnapshot
          ? money(ctx.previousProductSnapshot.grossProfit)
          : undefined,
        unit: MetricUnit.CURRENCY,
        higherIsBetter: true,
        spark: this.productMoneySpark(ctx, 'grossProfit'),
      }),
      meta: this.buildMeta(ctx, true),
    };
  }

  private productRevenueShare(
    key: ProductsAnalyticsWidgetKey,
    ctx: ProductsAnalyticsContext,
  ): WidgetDto {
    const productRevenue = ctx.currentProductSnapshot.revenue;
    const serviceRevenue = serviceRevenueFor(ctx.currentServiceSnapshot);
    const previousProductRevenue = ctx.previousProductSnapshot?.revenue;
    const previousServiceRevenue = serviceRevenueFor(
      ctx.previousServiceSnapshot,
    );
    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value: revenueShare(productRevenue, serviceRevenue),
        previousValue: previousProductRevenue
          ? revenueShare(previousProductRevenue, previousServiceRevenue)
          : undefined,
        unit: MetricUnit.PERCENT,
        higherIsBetter: true,
        spark: this.revenueShareSpark(ctx),
      }),
      meta: this.buildMeta(ctx, false),
    };
  }

  private repeatPurchaseRate(
    key: ProductsAnalyticsWidgetKey,
    ctx: ProductsAnalyticsContext,
  ): WidgetDto {
    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value: repeatRate(ctx.currentProductSnapshot),
        previousValue: ctx.previousProductSnapshot
          ? repeatRate(ctx.previousProductSnapshot)
          : undefined,
        unit: MetricUnit.PERCENT,
        higherIsBetter: true,
        spark: this.repeatRateSpark(ctx),
      }),
      meta: this.buildMeta(ctx, false),
    };
  }

  private async buildContext(
    locationId: string,
    dto: ProductsAnalyticsRequestDto,
  ): Promise<ProductsAnalyticsContext> {
    const range = await this.rangeService.resolve(locationId, dto);
    const compare = range.compareWithPrevious;
    const current = this.rangeFor(locationId, dto, range.from, range.to);
    const previous = this.rangeFor(
      locationId,
      dto,
      range.previousFrom,
      range.previousTo,
    );
    const currentSeriesRange = {
      ...current,
      granularity: range.granularity,
      timezone: range.timezone,
    };
    const needsRevenueShare = dto.keys.includes(
      ProductsAnalyticsWidgetKey.PRODUCT_REVENUE_SHARE,
    );

    const [
      currentProductSnapshot,
      previousProductSnapshot,
      currentProductSeries,
      currentServiceSnapshot,
      previousServiceSnapshot,
      currentServiceSeries,
    ] = await Promise.all([
      this.ordersAggregates.productSalesKpiSnapshot(current),
      compare
        ? this.ordersAggregates.productSalesKpiSnapshot(previous)
        : Promise.resolve(undefined),
      this.ordersAggregates.productSalesKpiSeries(currentSeriesRange),
      needsRevenueShare
        ? this.bookingsAggregates.snapshot(current)
        : Promise.resolve(undefined),
      needsRevenueShare && compare
        ? this.bookingsAggregates.snapshot(previous)
        : Promise.resolve(undefined),
      needsRevenueShare
        ? this.bookingsAggregates.series(
            {
              ...current,
              granularity: range.granularity,
              timezone: range.timezone,
              statuses: [BookingStatus.COMPLETED],
            },
            false,
          )
        : Promise.resolve([]),
    ]);

    return {
      range,
      currentProductSnapshot,
      previousProductSnapshot,
      currentProductSeries,
      currentServiceSnapshot,
      previousServiceSnapshot,
      currentServiceSeries,
    };
  }

  private rangeFor(
    locationId: string,
    dto: ProductsAnalyticsRequestDto,
    from: Date,
    to: Date,
  ): ProductSalesRange {
    return {
      locationId,
      from,
      to,
      staffId: dto.staffId,
      catalogItemId: dto.productId,
      categoryId: dto.categoryId,
    };
  }

  private productMoneySpark(
    ctx: ProductsAnalyticsContext,
    field: 'revenue' | 'grossProfit',
  ): number[] {
    const byBucket = productSeriesByBucket(ctx.currentProductSeries);
    return this.buckets.bucketStarts(ctx.range).map((bucket) => {
      const row = byBucket.get(bucket.getTime());
      return money(row?.[field] ?? MoneyService.decimal(0));
    });
  }

  private revenueShareSpark(ctx: ProductsAnalyticsContext): number[] {
    const productsByBucket = productSeriesByBucket(ctx.currentProductSeries);
    const servicesByBucket = serviceSeriesByBucket(ctx.currentServiceSeries);
    return this.buckets.bucketStarts(ctx.range).map((bucket) => {
      const key = bucket.getTime();
      return revenueShare(
        productsByBucket.get(key)?.revenue ?? MoneyService.decimal(0),
        servicesByBucket.get(key)?.revenue ?? MoneyService.decimal(0),
      );
    });
  }

  private repeatRateSpark(ctx: ProductsAnalyticsContext): number[] {
    const byBucket = productSeriesByBucket(ctx.currentProductSeries);
    return this.buckets.bucketStarts(ctx.range).map((bucket) => {
      const row = byBucket.get(bucket.getTime());
      return row ? ratio(row.repeatBuyerCount, row.buyerCount) : 0;
    });
  }

  private buildMeta(
    ctx: ProductsAnalyticsContext,
    withCurrency: boolean,
  ): WidgetMetaDto {
    return {
      period: this.buckets.periodDto(ctx.range),
      previousPeriod: ctx.range.compareWithPrevious
        ? this.buckets.previousPeriodDto(ctx.range)
        : undefined,
      currency: withCurrency ? ctx.range.currency : undefined,
    };
  }
}

function serviceRevenueFor(
  snapshot: ProductsAnalyticsContext['currentServiceSnapshot'],
): Prisma.Decimal {
  return (
    snapshot?.byStatus.get(BookingStatus.COMPLETED)?.revenue ??
    MoneyService.decimal(0)
  );
}

function revenueShare(
  productRevenue: Prisma.Decimal,
  serviceRevenue: Prisma.Decimal,
): number {
  return ratioDecimal(productRevenue, productRevenue.plus(serviceRevenue));
}

function repeatRate(snapshot: {
  repeatBuyerCount: number;
  buyerCount: number;
}): number {
  return ratio(snapshot.repeatBuyerCount, snapshot.buyerCount);
}

function ratio(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function ratioDecimal(part: Prisma.Decimal, total: Prisma.Decimal): number {
  return total.gt(0) ? Number(part.mul(100).div(total).toFixed(4)) : 0;
}

function money(value: Prisma.Decimal): number {
  return Number(MoneyService.format(value));
}

function productSeriesByBucket(
  rows: ProductSalesKpiSeriesRow[],
): Map<number, ProductSalesKpiSeriesRow> {
  return new Map(rows.map((row) => [row.bucket.getTime(), row]));
}

function serviceSeriesByBucket(rows: SeriesRow[]): Map<number, SeriesRow> {
  return new Map(rows.map((row) => [row.bucket.getTime(), row]));
}
