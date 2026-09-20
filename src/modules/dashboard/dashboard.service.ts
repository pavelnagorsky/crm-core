import { Injectable } from '@nestjs/common';
import { BookingSource, BookingStatus } from '@prisma/client';
import { BookingsAggregatesService } from '../bookings/bookings-aggregates.service.js';
import { AggregateRange } from '../bookings/interfaces/aggregate-range.interface.js';
import { AggregateSnapshot } from '../bookings/interfaces/aggregate-snapshot.interface.js';
import { SeriesRow } from '../bookings/interfaces/series-row.interface.js';
import { DashboardWidgetsRequestDto } from './dto/dashboard-widgets-request.dto.js';
import { WidgetBreakdownItemDto } from './dto/widget-breakdown-item.dto.js';
import { WidgetDto } from './dto/widget.dto.js';
import { WidgetFunnelStepDto } from './dto/widget-funnel-step.dto.js';
import { WidgetMetaDto } from './dto/widget-meta.dto.js';
import { WidgetMetricDto } from './dto/widget-metric.dto.js';
import { DashboardWidgetKey } from './enums/dashboard-widget-key.enum.js';
import { MetricUnit } from './enums/metric-unit.enum.js';
import { WidgetKind } from './enums/widget-kind.enum.js';
import { ResolvedRange } from './interfaces/resolved-range.interface.js';
import { DashboardBucketService } from './services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from './services/dashboard-metric.factory.js';
import { DashboardRangeService } from './services/dashboard-range.service.js';
import { DashboardSeriesFactory } from './services/dashboard-series.factory.js';

const REVENUE_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED];
// "Cancellation rate" divides cancellations by actively-decided bookings (confirmed + completed +
// cancelled). PENDING and NO_SHOW are excluded so pending bookings don't dilute the ratio and
// so no-show has its own separate rate widget.
const CANCELLATION_DENOMINATOR: BookingStatus[] = [BookingStatus.CANCELLED, BookingStatus.CONFIRMED, BookingStatus.COMPLETED];
const NO_SHOW_DENOMINATOR: BookingStatus[] = [BookingStatus.NO_SHOW, BookingStatus.COMPLETED];

interface WidgetContext {
  dto: DashboardWidgetsRequestDto;
  range: ResolvedRange;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly rangeService: DashboardRangeService,
    private readonly bookingsAggregates: BookingsAggregatesService,
    private readonly metricFactory: DashboardMetricFactory,
    private readonly seriesFactory: DashboardSeriesFactory,
    private readonly buckets: DashboardBucketService,
  ) {}

  async getWidgets(dto: DashboardWidgetsRequestDto): Promise<WidgetDto[]> {
    const range = await this.rangeService.resolve(dto.businessId, dto);
    const ctx: WidgetContext = { dto, range };
    return Promise.all(dto.keys.map((key) => this.buildWidget(key, ctx)));
  }

  private buildWidget(key: DashboardWidgetKey, ctx: WidgetContext): Promise<WidgetDto> {
    switch (key) {
      case DashboardWidgetKey.REVENUE_TOTAL:
        return this.revenueMetric(key, ctx, REVENUE_STATUSES);
      case DashboardWidgetKey.REVENUE_COMPLETED:
        return this.revenueMetric(key, ctx, [BookingStatus.COMPLETED]);
      case DashboardWidgetKey.AVG_TICKET:
        return this.avgTicketMetric(key, ctx);
      case DashboardWidgetKey.REVENUE_SERIES:
        return this.revenueSeries(key, ctx);
      case DashboardWidgetKey.BOOKINGS_TOTAL:
        return this.bookingsCountMetric(key, ctx, undefined, true);
      case DashboardWidgetKey.BOOKINGS_COMPLETED:
        return this.bookingsCountMetric(key, ctx, [BookingStatus.COMPLETED], true);
      case DashboardWidgetKey.BOOKINGS_CANCELLED:
        return this.bookingsCountMetric(key, ctx, [BookingStatus.CANCELLED], false);
      case DashboardWidgetKey.BOOKINGS_NO_SHOW:
        return this.bookingsCountMetric(key, ctx, [BookingStatus.NO_SHOW], false);
      case DashboardWidgetKey.BOOKINGS_PENDING:
        return this.bookingsCountMetric(key, ctx, [BookingStatus.PENDING], false);
      case DashboardWidgetKey.CANCELLATION_RATE:
        return this.rateMetric(key, ctx, [BookingStatus.CANCELLED], CANCELLATION_DENOMINATOR);
      case DashboardWidgetKey.NO_SHOW_RATE:
        return this.rateMetric(key, ctx, [BookingStatus.NO_SHOW], NO_SHOW_DENOMINATOR);
      case DashboardWidgetKey.BOOKINGS_SERIES:
        return this.bookingsSeries(key, ctx);
      case DashboardWidgetKey.BOOKINGS_BY_SOURCE:
        return this.bookingsBySource(key, ctx);
      case DashboardWidgetKey.FUNNEL:
        return this.funnel(key, ctx);
      default: {
        const _exhaustive: never = key;
        throw new Error(`Unhandled widget key: ${_exhaustive}`);
      }
    }
  }

  // ── revenue ──

  private async revenueMetric(
    key: DashboardWidgetKey,
    ctx: WidgetContext,
    statuses: BookingStatus[],
  ): Promise<WidgetDto> {
    const [snap, prevSnap, sparkRows] = await Promise.all([
      this.bookingsAggregates.snapshot(this.currentRange(ctx)),
      this.previousSnapshot(ctx),
      this.currentSeries(ctx, statuses),
    ]);
    const value = sumRevenue(snap, statuses);
    const previousValue = prevSnap ? sumRevenue(prevSnap, statuses) : undefined;
    return this.metricWidget(key, ctx, {
      value,
      previousValue,
      unit: MetricUnit.CURRENCY,
      higherIsBetter: true,
      spark: this.seriesFactory.spark(ctx.range, sparkRows, 'revenue'),
    }, true);
  }

  private async avgTicketMetric(key: DashboardWidgetKey, ctx: WidgetContext): Promise<WidgetDto> {
    const [snap, prevSnap] = await Promise.all([
      this.bookingsAggregates.snapshot(this.currentRange(ctx)),
      this.previousSnapshot(ctx),
    ]);
    const currCount = sumCount(snap, REVENUE_STATUSES);
    const currRev = sumRevenue(snap, REVENUE_STATUSES);
    const value = currCount > 0 ? currRev / currCount : 0;
    let previousValue: number | undefined;
    if (prevSnap) {
      const prevCount = sumCount(prevSnap, REVENUE_STATUSES);
      const prevRev = sumRevenue(prevSnap, REVENUE_STATUSES);
      previousValue = prevCount > 0 ? prevRev / prevCount : 0;
    }
    return this.metricWidget(key, ctx, {
      value,
      previousValue,
      unit: MetricUnit.CURRENCY,
      higherIsBetter: true,
    }, true);
  }

  private async revenueSeries(key: DashboardWidgetKey, ctx: WidgetContext): Promise<WidgetDto> {
    const [currRows, prevRows] = await Promise.all([
      this.currentSeries(ctx, REVENUE_STATUSES),
      this.previousSeries(ctx, REVENUE_STATUSES),
    ]);
    return {
      key,
      kind: WidgetKind.SERIES,
      series: {
        granularity: ctx.range.granularity,
        points: this.seriesFactory.fillSingle(ctx.range, currRows, 'revenue', 'revenue'),
        comparisonPoints: ctx.range.compareWithPrevious
          ? this.seriesFactory.fillComparison(ctx.range, prevRows, 'revenue', 'revenue')
          : undefined,
      },
      meta: this.buildMeta(ctx, true),
    };
  }

  // ── bookings ──

  private async bookingsCountMetric(
    key: DashboardWidgetKey,
    ctx: WidgetContext,
    statuses: BookingStatus[] | undefined,
    higherIsBetter: boolean,
  ): Promise<WidgetDto> {
    const [snap, prevSnap, sparkRows] = await Promise.all([
      this.bookingsAggregates.snapshot(this.currentRange(ctx)),
      this.previousSnapshot(ctx),
      this.currentSeries(ctx, statuses),
    ]);
    const value = sumCount(snap, statuses);
    const previousValue = prevSnap ? sumCount(prevSnap, statuses) : undefined;
    return this.metricWidget(key, ctx, {
      value,
      previousValue,
      unit: MetricUnit.COUNT,
      higherIsBetter,
      spark: this.seriesFactory.spark(ctx.range, sparkRows, 'count'),
    }, false);
  }

  private async rateMetric(
    key: DashboardWidgetKey,
    ctx: WidgetContext,
    numerator: BookingStatus[],
    denominator: BookingStatus[],
  ): Promise<WidgetDto> {
    const [snap, prevSnap] = await Promise.all([
      this.bookingsAggregates.snapshot(this.currentRange(ctx)),
      this.previousSnapshot(ctx),
    ]);
    const value = ratio(sumCount(snap, numerator), sumCount(snap, denominator));
    const previousValue = prevSnap ? ratio(sumCount(prevSnap, numerator), sumCount(prevSnap, denominator)) : undefined;
    return this.metricWidget(key, ctx, {
      value,
      previousValue,
      unit: MetricUnit.PERCENT,
      higherIsBetter: false,
    }, false);
  }

  private async bookingsSeries(key: DashboardWidgetKey, ctx: WidgetContext): Promise<WidgetDto> {
    const [currRows, prevRows] = await Promise.all([
      this.currentSeries(ctx, undefined, true),
      this.previousSeries(ctx, undefined, true),
    ]);
    const statusKey = (s: BookingStatus | null) => (s ?? 'unknown').toString().toLowerCase();
    const keys = new Set<string>([
      ...this.seriesFactory.collectStatusKeys(currRows, statusKey),
      ...this.seriesFactory.collectStatusKeys(prevRows, statusKey),
    ]);
    return {
      key,
      kind: WidgetKind.SERIES,
      series: {
        granularity: ctx.range.granularity,
        points: this.seriesFactory.fillByStatus(ctx.range, currRows, keys),
        comparisonPoints: ctx.range.compareWithPrevious
          ? this.seriesFactory.fillByStatusComparison(ctx.range, prevRows, keys)
          : undefined,
      },
      meta: this.buildMeta(ctx, false),
    };
  }

  private async bookingsBySource(key: DashboardWidgetKey, ctx: WidgetContext): Promise<WidgetDto> {
    const rows = await this.bookingsAggregates.countBySource(this.currentRange(ctx));
    const total = rows.reduce((s, r) => s + r.count, 0);
    const items: WidgetBreakdownItemDto[] = rows
      .map((r) => ({
        id: r.source,
        label: sourceLabel(r.source),
        value: r.count,
        sharePct: total > 0 ? +((r.count / total) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.value - a.value);
    return {
      key,
      kind: WidgetKind.BREAKDOWN,
      breakdown: { dimension: 'source', items, total },
      meta: this.buildMeta(ctx, false),
    };
  }

  private async funnel(key: DashboardWidgetKey, ctx: WidgetContext): Promise<WidgetDto> {
    const snap = await this.bookingsAggregates.snapshot(this.currentRange(ctx));
    const created = snap.totalCount;
    const confirmed = sumCount(snap, [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]);
    const completed = sumCount(snap, [BookingStatus.COMPLETED]);
    const steps: WidgetFunnelStepDto[] = [
      { label: 'Created', value: created },
      { label: 'Confirmed', value: confirmed, conversionFromPrev: pct(confirmed, created) },
      { label: 'Completed', value: completed, conversionFromPrev: pct(completed, confirmed) },
    ];
    return { key, kind: WidgetKind.FUNNEL, funnel: { steps }, meta: this.buildMeta(ctx, false) };
  }

  // ── helpers ──

  private currentRange(ctx: WidgetContext): AggregateRange {
    return this.rangeFor(ctx, ctx.range.from, ctx.range.to);
  }

  private previousRange(ctx: WidgetContext): AggregateRange {
    return this.rangeFor(ctx, ctx.range.previousFrom, ctx.range.previousTo);
  }

  private rangeFor(ctx: WidgetContext, from: Date, to: Date): AggregateRange {
    return {
      businessId: ctx.dto.businessId,
      from,
      to,
      staffId: ctx.dto.staffId,
      serviceId: ctx.dto.serviceId,
      categoryId: ctx.dto.categoryId,
    };
  }

  private previousSnapshot(ctx: WidgetContext): Promise<AggregateSnapshot | undefined> {
    if (!ctx.range.compareWithPrevious) return Promise.resolve(undefined);
    return this.bookingsAggregates.snapshot(this.previousRange(ctx));
  }

  private currentSeries(ctx: WidgetContext, statuses?: BookingStatus[], includeStatus = false): Promise<SeriesRow[]> {
    return this.bookingsAggregates.series(
      { ...this.currentRange(ctx), granularity: ctx.range.granularity, timezone: ctx.range.timezone, statuses },
      includeStatus,
    );
  }

  private previousSeries(ctx: WidgetContext, statuses?: BookingStatus[], includeStatus = false): Promise<SeriesRow[]> {
    if (!ctx.range.compareWithPrevious) return Promise.resolve([]);
    return this.bookingsAggregates.series(
      { ...this.previousRange(ctx), granularity: ctx.range.granularity, timezone: ctx.range.timezone, statuses },
      includeStatus,
    );
  }

  private metricWidget(
    key: DashboardWidgetKey,
    ctx: WidgetContext,
    input: { value: number; previousValue?: number; unit: MetricUnit; higherIsBetter: boolean; spark?: number[] },
    withCurrency: boolean,
  ): WidgetDto {
    const metric: WidgetMetricDto = this.metricFactory.build(input);
    return { key, kind: WidgetKind.METRIC, metric, meta: this.buildMeta(ctx, withCurrency) };
  }

  private buildMeta(ctx: WidgetContext, withCurrency: boolean): WidgetMetaDto {
    return {
      period: this.buckets.periodDto(ctx.range),
      previousPeriod: ctx.range.compareWithPrevious ? this.buckets.previousPeriodDto(ctx.range) : undefined,
      currency: withCurrency ? ctx.range.currency : undefined,
    };
  }
}

function sumCount(snap: AggregateSnapshot, statuses: BookingStatus[] | undefined): number {
  if (!statuses) return snap.totalCount;
  let sum = 0;
  for (const s of statuses) sum += snap.byStatus.get(s)?.count ?? 0;
  return sum;
}

function sumRevenue(snap: AggregateSnapshot, statuses: BookingStatus[] | undefined): number {
  if (!statuses) return snap.totalRevenue;
  let sum = 0;
  for (const s of statuses) sum += snap.byStatus.get(s)?.revenue ?? 0;
  return sum;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? +((part / whole) * 100).toFixed(1) : 0;
}

function sourceLabel(s: BookingSource): string {
  switch (s) {
    case BookingSource.PUBLIC_PAGE: return 'Public page';
    case BookingSource.WIDGET: return 'Widget';
    case BookingSource.MANUAL: return 'Manual';
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}
