import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { BookingsAggregatesService } from '../../bookings/bookings-aggregates.service.js';
import { AggregateRange } from '../../bookings/interfaces/aggregate-range.interface.js';
import { AggregateSnapshot } from '../../bookings/interfaces/aggregate-snapshot.interface.js';
import { ServiceCount } from '../../bookings/interfaces/service-count.interface.js';
import { SeriesRow } from '../../bookings/interfaces/series-row.interface.js';
import { WidgetBreakdownItemDto } from '../../dashboard/dto/widget-breakdown-item.dto.js';
import { WidgetDto } from '../../dashboard/dto/widget.dto.js';
import { WidgetMetaDto } from '../../dashboard/dto/widget-meta.dto.js';
import { MetricUnit } from '../../dashboard/enums/metric-unit.enum.js';
import { WidgetKind } from '../../dashboard/enums/widget-kind.enum.js';
import { ResolvedRange } from '../../dashboard/interfaces/resolved-range.interface.js';
import { DashboardBucketService } from '../../dashboard/services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from '../../dashboard/services/dashboard-metric.factory.js';
import { DashboardRangeService } from '../../dashboard/services/dashboard-range.service.js';
import { DashboardSeriesFactory } from '../../dashboard/services/dashboard-series.factory.js';
import { ServicesService } from '../services.service.js';
import { ServicesAnalyticsRequestDto } from './dto/services-analytics-request.dto.js';
import { ServicesAnalyticsWidgetKey } from './enums/services-analytics-widget-key.enum.js';

const COMPLETED_STATUSES: BookingStatus[] = [BookingStatus.COMPLETED];
const DEMAND_TOP_N = 5;

interface AnalyticsContext {
  businessId: string;
  range: ResolvedRange;
  // `undefined` means "no service filter applied"; an array (possibly empty) means the filter
  // was applied and only these ids may contribute — an empty array intentionally results in
  // zero-valued widgets rather than "unfiltered totals".
  serviceIds: string[] | undefined;
  // Batched sources so overlapping widgets share the same queries.
  currentSnapshot: AggregateSnapshot;
  previousSnapshot?: AggregateSnapshot;
  currentSeries: SeriesRow[];
  currentServiceCounts?: ServiceCount[];
}

@Injectable()
export class ServicesAnalyticsService {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly rangeService: DashboardRangeService,
    private readonly aggregates: BookingsAggregatesService,
    private readonly metricFactory: DashboardMetricFactory,
    private readonly seriesFactory: DashboardSeriesFactory,
    private readonly buckets: DashboardBucketService,
  ) {}

  async getWidgets(businessId: string, dto: ServicesAnalyticsRequestDto): Promise<WidgetDto[]> {
    const ctx = await this.buildContext(businessId, dto);
    return dto.keys.map((key) => this.buildWidget(key, ctx));
  }

  private buildWidget(key: ServicesAnalyticsWidgetKey, ctx: AnalyticsContext): WidgetDto {
    switch (key) {
      case ServicesAnalyticsWidgetKey.SERVICES_COMPLETED_COUNT:
        return this.completedCountMetric(key, ctx);
      case ServicesAnalyticsWidgetKey.REVENUE_PER_HOUR:
        return this.revenuePerHourMetric(key, ctx);
      case ServicesAnalyticsWidgetKey.SERVICES_DEMAND_BREAKDOWN:
        return this.demandBreakdown(key, ctx);
      default: {
        const _exhaustive: never = key;
        throw new Error(`Unhandled services-analytics widget key: ${_exhaustive}`);
      }
    }
  }

  // ── widgets ──────────────────────────────────────────────────────────────

  private completedCountMetric(key: ServicesAnalyticsWidgetKey, ctx: AnalyticsContext): WidgetDto {
    const value = countFor(ctx.currentSnapshot, COMPLETED_STATUSES);
    const previousValue = ctx.previousSnapshot ? countFor(ctx.previousSnapshot, COMPLETED_STATUSES) : undefined;
    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value,
        previousValue,
        unit: MetricUnit.COUNT,
        higherIsBetter: true,
        spark: this.seriesFactory.spark(ctx.range, ctx.currentSeries, 'count'),
      }),
      meta: this.buildMeta(ctx, false),
    };
  }

  private revenuePerHourMetric(key: ServicesAnalyticsWidgetKey, ctx: AnalyticsContext): WidgetDto {
    const value = revenuePerHour(ctx.currentSnapshot, COMPLETED_STATUSES);
    const previousValue = ctx.previousSnapshot ? revenuePerHour(ctx.previousSnapshot, COMPLETED_STATUSES) : undefined;
    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value,
        previousValue,
        unit: MetricUnit.CURRENCY,
        higherIsBetter: true,
        spark: this.buildRevenuePerHourSpark(ctx),
      }),
      meta: this.buildMeta(ctx, true),
    };
  }

  private demandBreakdown(key: ServicesAnalyticsWidgetKey, ctx: AnalyticsContext): WidgetDto {
    const rows = ctx.currentServiceCounts ?? [];
    const sorted = [...rows].sort((a, b) => b.count - a.count);
    const total = sorted.reduce((s, r) => s + r.count, 0);

    const head = sorted.slice(0, DEMAND_TOP_N);
    const items: WidgetBreakdownItemDto[] = head.map((r) => breakdownItem(r, total));

    const tail = sorted.slice(DEMAND_TOP_N);
    if (tail.length > 0) {
      const tailCount = tail.reduce((s, r) => s + r.count, 0);
      items.push({
        id: null,
        label: 'Other',
        value: tailCount,
        sharePct: sharePct(tailCount, total),
      });
    }

    return {
      key,
      kind: WidgetKind.BREAKDOWN,
      breakdown: { dimension: 'service', items, total },
      meta: this.buildMeta(ctx, false),
    };
  }

  // ── data plumbing ────────────────────────────────────────────────────────

  private async buildContext(businessId: string, dto: ServicesAnalyticsRequestDto): Promise<AnalyticsContext> {
    const range = await this.rangeService.resolve(businessId, dto);
    const serviceIds = await this.resolveServiceIds(businessId, dto);
    const currentRange = this.rangeFor(businessId, serviceIds, range.from, range.to);
    const previousRange = this.rangeFor(businessId, serviceIds, range.previousFrom, range.previousTo);

    const needsCurrentSnapshot = this.needsAnyMetric(dto.keys);
    const needsPreviousSnapshot = needsCurrentSnapshot && range.compareWithPrevious;
    const needsSeries = this.needsAnySpark(dto.keys);
    const needsBreakdown = dto.keys.includes(ServicesAnalyticsWidgetKey.SERVICES_DEMAND_BREAKDOWN);

    const [currentSnapshot, previousSnapshot, currentSeries, currentServiceCounts] = await Promise.all([
      needsCurrentSnapshot ? this.aggregates.snapshot(currentRange) : Promise.resolve(emptySnapshot()),
      needsPreviousSnapshot ? this.aggregates.snapshot(previousRange) : Promise.resolve(undefined),
      needsSeries
        ? this.aggregates.series(
            { ...currentRange, granularity: range.granularity, timezone: range.timezone, statuses: COMPLETED_STATUSES },
            false,
          )
        : Promise.resolve([] as SeriesRow[]),
      needsBreakdown ? this.aggregates.countByService(currentRange, COMPLETED_STATUSES) : Promise.resolve(undefined),
    ]);

    return { businessId, range, serviceIds, currentSnapshot, previousSnapshot, currentSeries, currentServiceCounts };
  }

  private async resolveServiceIds(businessId: string, dto: ServicesAnalyticsRequestDto): Promise<string[] | undefined> {
    if (dto.search === undefined && dto.categoryId === undefined && dto.status === undefined) return undefined;
    return this.servicesService.findIdsByFilter(businessId, {
      search: dto.search,
      categoryId: dto.categoryId,
      status: dto.status,
    });
  }

  private rangeFor(businessId: string, serviceIds: string[] | undefined, from: Date, to: Date): AggregateRange {
    const range: AggregateRange = { businessId, from, to };
    if (serviceIds !== undefined) range.serviceIds = serviceIds;
    return range;
  }

  private buildRevenuePerHourSpark(ctx: AnalyticsContext): number[] {
    // Delegate bucket alignment to the factory so empty buckets get zeros just like count-based
    // sparks; each bucket's ratio is revenue / (duration_minutes / 60).
    const revenueByBucket = this.seriesFactory.spark(ctx.range, ctx.currentSeries, 'revenue');
    const durationByBucket = this.buildDurationSpark(ctx);
    return revenueByBucket.map((rev, i) => {
      const durationMinutes = durationByBucket[i] ?? 0;
      return durationMinutes > 0 ? rev / (durationMinutes / 60) : 0;
    });
  }

  private buildDurationSpark(ctx: AnalyticsContext): number[] {
    // seriesFactory.spark only understands 'revenue' | 'count'; project duration ourselves
    // using the same bucket set the factory uses so both arrays line up positionally.
    const bucketStarts = this.buckets.bucketStarts(ctx.range);
    const byBucket = new Map<number, number>();
    for (const r of ctx.currentSeries) byBucket.set(r.bucket.getTime(), r.duration);
    return bucketStarts.map((b) => byBucket.get(b.getTime()) ?? 0);
  }

  private needsAnyMetric(keys: ServicesAnalyticsWidgetKey[]): boolean {
    return keys.some(
      (k) => k === ServicesAnalyticsWidgetKey.SERVICES_COMPLETED_COUNT || k === ServicesAnalyticsWidgetKey.REVENUE_PER_HOUR,
    );
  }

  private needsAnySpark(keys: ServicesAnalyticsWidgetKey[]): boolean {
    return this.needsAnyMetric(keys);
  }

  private buildMeta(ctx: AnalyticsContext, withCurrency: boolean): WidgetMetaDto {
    return {
      period: this.buckets.periodDto(ctx.range),
      previousPeriod: ctx.range.compareWithPrevious ? this.buckets.previousPeriodDto(ctx.range) : undefined,
      currency: withCurrency ? ctx.range.currency : undefined,
    };
  }
}

function countFor(snap: AggregateSnapshot, statuses: BookingStatus[]): number {
  let sum = 0;
  for (const s of statuses) sum += snap.byStatus.get(s)?.count ?? 0;
  return sum;
}

function revenueFor(snap: AggregateSnapshot, statuses: BookingStatus[]): number {
  let sum = 0;
  for (const s of statuses) sum += snap.byStatus.get(s)?.revenue ?? 0;
  return sum;
}

function durationFor(snap: AggregateSnapshot, statuses: BookingStatus[]): number {
  let sum = 0;
  for (const s of statuses) sum += snap.byStatus.get(s)?.duration ?? 0;
  return sum;
}

function revenuePerHour(snap: AggregateSnapshot, statuses: BookingStatus[]): number {
  const revenue = revenueFor(snap, statuses);
  const durationMinutes = durationFor(snap, statuses);
  return durationMinutes > 0 ? revenue / (durationMinutes / 60) : 0;
}

function sharePct(part: number, total: number): number {
  return total > 0 ? +((part / total) * 100).toFixed(1) : 0;
}

function breakdownItem(row: ServiceCount, total: number): WidgetBreakdownItemDto {
  return {
    id: row.serviceId,
    label: row.serviceTitle,
    value: row.count,
    secondaryValue: row.revenue,
    sharePct: sharePct(row.count, total),
  };
}

function emptySnapshot(): AggregateSnapshot {
  return { byStatus: new Map(), totalCount: 0, totalRevenue: 0, totalDuration: 0 };
}
