import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { SeriesRow } from '../../../bookings/interfaces/series-row.interface.js';
import { WidgetMetaDto } from '../../../dashboard/dto/widget-meta.dto.js';
import { WidgetDto } from '../../../dashboard/dto/widget.dto.js';
import { MetricUnit } from '../../../dashboard/enums/metric-unit.enum.js';
import { WidgetKind } from '../../../dashboard/enums/widget-kind.enum.js';
import { DashboardBucketFactory } from '../../../dashboard/factories/dashboard-bucket.factory.js';
import { DashboardMetricFactory } from '../../../dashboard/factories/dashboard-metric.factory.js';
import { ProductSalesKpiSeriesRow } from '../../../orders/aggregates/interfaces/product-sales-kpi-series-row.interface.js';
import { ProductsAnalyticsWidgetKey } from '../enums/products-analytics-widget-key.enum.js';
import { ProductsAnalyticsContext } from '../interfaces/products-analytics-context.interface.js';

@Injectable()
export class ProductsAnalyticsWidgetFactory {
  constructor(
    private readonly metricFactory: DashboardMetricFactory,
    private readonly buckets: DashboardBucketFactory,
  ) {}

  build(
    keys: ProductsAnalyticsWidgetKey[],
    context: ProductsAnalyticsContext,
  ): WidgetDto[] {
    return keys.map((key) => this.buildWidget(key, context));
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
        spark: this.grossProfitSpark(ctx),
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
        value: ratioDecimal(
          productRevenue,
          ctx.currentAllProductRevenue.plus(serviceRevenue),
        ),
        previousValue:
          previousProductRevenue && ctx.previousAllProductRevenue
            ? ratioDecimal(
                previousProductRevenue,
                ctx.previousAllProductRevenue.plus(previousServiceRevenue),
              )
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

  private grossProfitSpark(ctx: ProductsAnalyticsContext): number[] {
    const byBucket = productSeriesByBucket(ctx.currentProductSeries);
    return this.buckets.bucketStarts(ctx.range).map((bucket) => {
      const row = byBucket.get(bucket.getTime());
      return money(row?.grossProfit ?? MoneyUtils.decimal(0));
    });
  }

  private revenueShareSpark(ctx: ProductsAnalyticsContext): number[] {
    const productsByBucket = productSeriesByBucket(ctx.currentProductSeries);
    const servicesByBucket = serviceSeriesByBucket(ctx.currentServiceSeries);
    const allProductsByBucket = new Map(
      ctx.currentAllProductSeries.map((row) => [
        row.bucket.getTime(),
        row.revenue,
      ]),
    );
    return this.buckets.bucketStarts(ctx.range).map((bucket) => {
      const key = bucket.getTime();
      return ratioDecimal(
        productsByBucket.get(key)?.revenue ?? MoneyUtils.decimal(0),
        (allProductsByBucket.get(key) ?? MoneyUtils.decimal(0)).plus(
          servicesByBucket.get(key)?.revenue ?? MoneyUtils.decimal(0),
        ),
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
    MoneyUtils.decimal(0)
  );
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
  return Number(MoneyUtils.format(value));
}

function productSeriesByBucket(
  rows: ProductSalesKpiSeriesRow[],
): Map<number, ProductSalesKpiSeriesRow> {
  return new Map(rows.map((row) => [row.bucket.getTime(), row]));
}

function serviceSeriesByBucket(rows: SeriesRow[]): Map<number, SeriesRow> {
  return new Map(rows.map((row) => [row.bucket.getTime(), row]));
}
