import { Injectable } from '@nestjs/common';
import { BookingSource, BookingStatus, Prisma } from '@prisma/client';
import { MoneyService } from '../../shared/money/money.service.js';
import { BookingsAggregatesService } from '../bookings/aggregates/bookings-aggregates.service.js';
import { AggregateSnapshot } from '../bookings/interfaces/aggregate-snapshot.interface.js';
import { SeriesRow } from '../bookings/interfaces/series-row.interface.js';
import { OrdersAggregatesService } from '../orders/analytics/orders-aggregates.service.js';
import { ProductSalesSeriesRow } from '../orders/analytics/interfaces/product-sales-series-row.interface.js';
import { ProductSalesSnapshot } from '../orders/analytics/interfaces/product-sales-snapshot.interface.js';
import { DashboardWidgetsRequestDto } from './dto/dashboard-widgets-request.dto.js';
import { WidgetBreakdownItemDto } from './dto/widget-breakdown-item.dto.js';
import { WidgetDto } from './dto/widget.dto.js';
import { WidgetMetaDto } from './dto/widget-meta.dto.js';
import { WidgetMetricDto } from './dto/widget-metric.dto.js';
import { DashboardWidgetKey } from './enums/dashboard-widget-key.enum.js';
import { MetricUnit } from './enums/metric-unit.enum.js';
import { WidgetKind } from './enums/widget-kind.enum.js';
import { DashboardReadContext } from './interfaces/dashboard-read-context.interface.js';
import { ResolvedRange } from './interfaces/resolved-range.interface.js';
import { DashboardBucketService } from './services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from './services/dashboard-metric.factory.js';
import { DashboardRangeService } from './services/dashboard-range.service.js';
import { DashboardSeriesFactory } from './services/dashboard-series.factory.js';

const REVENUE_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
];
// "Cancellation rate" divides cancellations by actively-decided bookings (confirmed + completed +
// cancelled). PENDING and NO_SHOW are excluded so pending bookings don't dilute the ratio and
// so no-show has its own separate rate widget.
const CANCELLATION_DENOMINATOR: BookingStatus[] = [
  BookingStatus.CANCELLED,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
];
const NO_SHOW_DENOMINATOR: BookingStatus[] = [
  BookingStatus.NO_SHOW,
  BookingStatus.COMPLETED,
];
// Completion rate: completed / all statuses (total bookings in period).
const COMPLETION_DENOMINATOR: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CONFIRMED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
  BookingStatus.PENDING,
];
const DEFAULT_TOP_N = 5;

const BOOKING_SNAPSHOT_KEYS = new Set<DashboardWidgetKey>([
  DashboardWidgetKey.REVENUE_TOTAL,
  DashboardWidgetKey.REVENUE_COMPLETED,
  DashboardWidgetKey.AVG_TICKET,
  DashboardWidgetKey.BOOKINGS_TOTAL,
  DashboardWidgetKey.BOOKINGS_COMPLETED,
  DashboardWidgetKey.BOOKINGS_CANCELLED,
  DashboardWidgetKey.BOOKINGS_NO_SHOW,
  DashboardWidgetKey.BOOKINGS_PENDING,
  DashboardWidgetKey.CANCELLATION_RATE,
  DashboardWidgetKey.NO_SHOW_RATE,
  DashboardWidgetKey.COMPLETION_RATE,
]);
const BOOKING_SERIES_KEYS = new Set<DashboardWidgetKey>([
  DashboardWidgetKey.REVENUE_TOTAL,
  DashboardWidgetKey.REVENUE_COMPLETED,
  DashboardWidgetKey.REVENUE_SERIES,
  DashboardWidgetKey.BOOKINGS_TOTAL,
  DashboardWidgetKey.BOOKINGS_COMPLETED,
  DashboardWidgetKey.BOOKINGS_CANCELLED,
  DashboardWidgetKey.BOOKINGS_NO_SHOW,
  DashboardWidgetKey.BOOKINGS_PENDING,
  DashboardWidgetKey.BOOKINGS_SERIES,
]);
const PREVIOUS_BOOKING_SERIES_KEYS = new Set<DashboardWidgetKey>([
  DashboardWidgetKey.REVENUE_SERIES,
  DashboardWidgetKey.BOOKINGS_SERIES,
]);
const PRODUCT_SNAPSHOT_KEYS = new Set<DashboardWidgetKey>([
  DashboardWidgetKey.REVENUE_TOTAL,
  DashboardWidgetKey.REVENUE_COMPLETED,
  DashboardWidgetKey.AVG_TICKET,
]);
const PRODUCT_SERIES_KEYS = new Set<DashboardWidgetKey>([
  DashboardWidgetKey.REVENUE_TOTAL,
  DashboardWidgetKey.REVENUE_COMPLETED,
  DashboardWidgetKey.REVENUE_SERIES,
]);

@Injectable()
export class DashboardService {
  constructor(
    private readonly rangeService: DashboardRangeService,
    private readonly bookingsAggregates: BookingsAggregatesService,
    private readonly ordersAggregates: OrdersAggregatesService,
    private readonly metricFactory: DashboardMetricFactory,
    private readonly seriesFactory: DashboardSeriesFactory,
    private readonly buckets: DashboardBucketService,
  ) {}

  async getWidgets(
    locationId: string,
    dto: DashboardWidgetsRequestDto,
  ): Promise<WidgetDto[]> {
    const range = await this.rangeService.resolve(locationId, dto);
    const ctx = await this.loadContext(locationId, dto, range);
    return dto.keys.map((key) => this.buildWidget(key, ctx));
  }

  private buildWidget(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
  ): WidgetDto {
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
        return this.bookingsCountMetric(
          key,
          ctx,
          [BookingStatus.COMPLETED],
          true,
        );
      case DashboardWidgetKey.BOOKINGS_CANCELLED:
        return this.bookingsCountMetric(
          key,
          ctx,
          [BookingStatus.CANCELLED],
          false,
        );
      case DashboardWidgetKey.BOOKINGS_NO_SHOW:
        return this.bookingsCountMetric(
          key,
          ctx,
          [BookingStatus.NO_SHOW],
          false,
        );
      case DashboardWidgetKey.BOOKINGS_PENDING:
        return this.bookingsCountMetric(
          key,
          ctx,
          [BookingStatus.PENDING],
          false,
        );
      case DashboardWidgetKey.CANCELLATION_RATE:
        return this.rateMetric(
          key,
          ctx,
          [BookingStatus.CANCELLED],
          CANCELLATION_DENOMINATOR,
          false,
        );
      case DashboardWidgetKey.NO_SHOW_RATE:
        return this.rateMetric(
          key,
          ctx,
          [BookingStatus.NO_SHOW],
          NO_SHOW_DENOMINATOR,
          false,
        );
      case DashboardWidgetKey.COMPLETION_RATE:
        return this.rateMetric(
          key,
          ctx,
          [BookingStatus.COMPLETED],
          COMPLETION_DENOMINATOR,
          true,
        );
      case DashboardWidgetKey.BOOKINGS_SERIES:
        return this.bookingsSeries(key, ctx);
      case DashboardWidgetKey.BOOKINGS_BY_SOURCE:
        return this.bookingsBySource(key, ctx);
      case DashboardWidgetKey.BOOKINGS_HEATMAP:
        return this.bookingsHeatmap(key, ctx);
      case DashboardWidgetKey.REVENUE_BY_STAFF:
        return this.revenueByStaff(key, ctx);
      default: {
        const _exhaustive: never = key;
        throw new Error(`Unhandled widget key: ${_exhaustive}`);
      }
    }
  }

  // ── revenue ──

  private revenueMetric(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
    statuses: BookingStatus[],
  ): WidgetDto {
    const snap = ctx.bookingSnapshot;
    const prevSnap = ctx.previousBookingSnapshot;
    const orderSnap = ctx.productSnapshot;
    const prevOrderSnap = ctx.previousProductSnapshot;
    const sparkRows = mergeRevenueSeries(
      collapseSeries(ctx.bookingSeries, statuses),
      ctx.productSeries,
    );
    const value = chartMoney(
      sumRevenue(snap, statuses).plus(orderSnap.revenue),
    );
    const previousValue =
      prevSnap && prevOrderSnap
        ? chartMoney(sumRevenue(prevSnap, statuses).plus(prevOrderSnap.revenue))
        : undefined;
    return this.metricWidget(
      key,
      ctx,
      {
        value,
        previousValue,
        unit: MetricUnit.CURRENCY,
        higherIsBetter: true,
        spark: this.seriesFactory.spark(ctx.range, sparkRows, 'revenue'),
      },
      true,
    );
  }

  private avgTicketMetric(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
  ): WidgetDto {
    const snap = ctx.bookingSnapshot;
    const prevSnap = ctx.previousBookingSnapshot;
    const orderSnap = ctx.productSnapshot;
    const prevOrderSnap = ctx.previousProductSnapshot;
    const currCount = commercialEventCount(
      sumCount(snap, [BookingStatus.COMPLETED]),
      orderSnap,
    );
    const currRev = sumRevenue(snap, [BookingStatus.COMPLETED]).plus(
      orderSnap.revenue,
    );
    const value =
      currCount > 0
        ? chartMoney(MoneyService.quantize(currRev.div(currCount)))
        : 0;
    let previousValue: number | undefined;
    if (prevSnap && prevOrderSnap) {
      const prevCount = commercialEventCount(
        sumCount(prevSnap, [BookingStatus.COMPLETED]),
        prevOrderSnap,
      );
      const prevRev = sumRevenue(prevSnap, [BookingStatus.COMPLETED]).plus(
        prevOrderSnap.revenue,
      );
      previousValue =
        prevCount > 0
          ? chartMoney(MoneyService.quantize(prevRev.div(prevCount)))
          : 0;
    }
    return this.metricWidget(
      key,
      ctx,
      {
        value,
        previousValue,
        unit: MetricUnit.CURRENCY,
        higherIsBetter: true,
      },
      true,
    );
  }

  private revenueSeries(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
  ): WidgetDto {
    const currRows = mergeRevenueSeries(
      collapseSeries(ctx.bookingSeries, REVENUE_STATUSES),
      ctx.productSeries,
    );
    const prevRows = mergeRevenueSeries(
      collapseSeries(ctx.previousBookingSeries, REVENUE_STATUSES),
      ctx.previousProductSeries,
    );
    return {
      key,
      kind: WidgetKind.SERIES,
      series: {
        granularity: ctx.range.granularity,
        points: this.seriesFactory.fillSingle(
          ctx.range,
          currRows,
          'revenue',
          'revenue',
        ),
        comparisonPoints: ctx.range.compareWithPrevious
          ? this.seriesFactory.fillComparison(
              ctx.range,
              prevRows,
              'revenue',
              'revenue',
            )
          : undefined,
      },
      meta: this.buildMeta(ctx, true),
    };
  }

  // ── bookings ──

  private bookingsCountMetric(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
    statuses: BookingStatus[] | undefined,
    higherIsBetter: boolean,
  ): WidgetDto {
    const snap = ctx.bookingSnapshot;
    const prevSnap = ctx.previousBookingSnapshot;
    const sparkRows = collapseSeries(ctx.bookingSeries, statuses);
    const value = sumCount(snap, statuses);
    const previousValue = prevSnap ? sumCount(prevSnap, statuses) : undefined;
    return this.metricWidget(
      key,
      ctx,
      {
        value,
        previousValue,
        unit: MetricUnit.COUNT,
        higherIsBetter,
        spark: this.seriesFactory.spark(ctx.range, sparkRows, 'count'),
      },
      false,
    );
  }

  private rateMetric(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
    numerator: BookingStatus[],
    denominator: BookingStatus[],
    higherIsBetter: boolean,
  ): WidgetDto {
    const snap = ctx.bookingSnapshot;
    const prevSnap = ctx.previousBookingSnapshot;
    const value = ratio(sumCount(snap, numerator), sumCount(snap, denominator));
    const previousValue = prevSnap
      ? ratio(sumCount(prevSnap, numerator), sumCount(prevSnap, denominator))
      : undefined;
    return this.metricWidget(
      key,
      ctx,
      {
        value,
        previousValue,
        unit: MetricUnit.PERCENT,
        higherIsBetter,
      },
      false,
    );
  }

  private bookingsSeries(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
  ): WidgetDto {
    const currRows = ctx.bookingSeries;
    const prevRows = ctx.previousBookingSeries;
    const statusKey = (s: BookingStatus | null) =>
      (s ?? 'unknown').toString().toLowerCase();
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

  private bookingsBySource(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
  ): WidgetDto {
    const rows = ctx.sourceRows;
    const total = rows.reduce((s, r) => s + r.count, 0);
    const items: WidgetBreakdownItemDto[] = rows
      .map((r) => ({
        id: r.source,
        label: sourceLabel(r.source),
        value: r.count,
        sharePct: pct(r.count, total),
      }))
      .sort((a, b) => b.value - a.value);
    return {
      key,
      kind: WidgetKind.BREAKDOWN,
      breakdown: { dimension: 'source', items, total },
      meta: this.buildMeta(ctx, false),
    };
  }

  // ── heatmap ──

  private bookingsHeatmap(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
  ): WidgetDto {
    const cells = ctx.heatmapCells;
    // Axes are numeric identifiers, not localized strings: xLabels are hours 0..23 and yLabels
    // are ISO weekdays 1..7 (Mon..Sun). The frontend maps them to its own locale.
    const xLabels = Array.from({ length: 24 }, (_, h) => String(h));
    const yLabels = Array.from({ length: 7 }, (_, i) => String(i + 1));
    const matrix: number[][] = yLabels.map(() => xLabels.map(() => 0));
    for (const c of cells) {
      if (c.weekday < 1 || c.weekday > 7 || c.hour < 0 || c.hour > 23) continue;
      matrix[c.weekday - 1][c.hour] = c.count;
    }
    return {
      key,
      kind: WidgetKind.HEATMAP,
      heatmap: { xLabels, yLabels, matrix },
      meta: this.buildMeta(ctx, false),
    };
  }

  // ── staff breakdown ──

  private revenueByStaff(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
  ): WidgetDto {
    // Revenue uses confirmed + completed; secondary count uses completed only.
    const revenueRows = ctx.staffRevenueRows;
    const completedRows = ctx.staffCompletedRows;
    const productRows = ctx.productStaffRows;
    const completedById = new Map(
      completedRows.map((r) => [r.staffId, r.count]),
    );
    const byStaff = new Map(
      revenueRows.map((row) => [
        row.staffId,
        { ...row, activityCount: completedById.get(row.staffId) ?? 0 },
      ]),
    );
    for (const row of productRows) {
      const current = byStaff.get(row.staffId);
      byStaff.set(row.staffId, {
        staffId: row.staffId,
        staffName: row.staffName,
        count: current?.count ?? 0,
        revenue: (current?.revenue ?? MoneyService.decimal(0)).plus(
          row.revenue,
        ),
        activityCount: (current?.activityCount ?? 0) + row.orderCount,
      });
    }

    const mergedRows = [...byStaff.values()];
    const total = chartMoney(sumDecimals(mergedRows.map((r) => r.revenue)));
    const topN = ctx.dto.topN ?? DEFAULT_TOP_N;

    const items: WidgetBreakdownItemDto[] = mergedRows
      .map((r) => {
        const value = chartMoney(r.revenue);
        return {
          id: r.staffId,
          label: r.staffName,
          value,
          secondaryValue: r.activityCount,
          sharePct: pct(value, total),
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);

    return {
      key,
      kind: WidgetKind.BREAKDOWN,
      breakdown: { dimension: 'staff', items, total },
      meta: this.buildMeta(ctx, true),
    };
  }

  // ── helpers ──

  private async loadContext(
    locationId: string,
    dto: DashboardWidgetsRequestDto,
    range: ResolvedRange,
  ): Promise<DashboardReadContext> {
    const selected = new Set(dto.keys);
    const compare = range.compareWithPrevious;
    const needsBookingSnapshot = wants(selected, BOOKING_SNAPSHOT_KEYS);
    const needsBookingSeries = wants(selected, BOOKING_SERIES_KEYS);
    const needsPreviousBookingSeries =
      compare && wants(selected, PREVIOUS_BOOKING_SERIES_KEYS);
    const needsProductSnapshot = wants(selected, PRODUCT_SNAPSHOT_KEYS);
    const needsProductSeries = wants(selected, PRODUCT_SERIES_KEYS);
    const needsPreviousProductSeries =
      compare && selected.has(DashboardWidgetKey.REVENUE_SERIES);
    const needsStaff = selected.has(DashboardWidgetKey.REVENUE_BY_STAFF);
    const current = windowRange(locationId, dto, range.from, range.to);
    const previous = windowRange(
      locationId,
      dto,
      range.previousFrom,
      range.previousTo,
    );
    const [
      bookingSnapshot,
      previousBookingSnapshot,
      bookingSeries,
      previousBookingSeries,
      productSnapshot,
      previousProductSnapshot,
      productSeries,
      previousProductSeries,
      sourceRows,
      heatmapCells,
      staffRevenueRows,
      staffCompletedRows,
      productStaffRows,
    ] = await Promise.all([
      needsBookingSnapshot
        ? this.bookingsAggregates.snapshot(current)
        : Promise.resolve(emptySnapshot()),
      needsBookingSnapshot && compare
        ? this.bookingsAggregates.snapshot(previous)
        : Promise.resolve(undefined),
      needsBookingSeries
        ? this.bookingsAggregates.series(
            {
              ...current,
              granularity: range.granularity,
              timezone: range.timezone,
            },
            true,
          )
        : Promise.resolve([]),
      needsPreviousBookingSeries
        ? this.bookingsAggregates.series(
            {
              ...previous,
              granularity: range.granularity,
              timezone: range.timezone,
            },
            true,
          )
        : Promise.resolve([]),
      needsProductSnapshot
        ? this.ordersAggregates.productSalesSnapshot(current)
        : Promise.resolve(emptyProductSnapshot()),
      needsProductSnapshot && compare
        ? this.ordersAggregates.productSalesSnapshot(previous)
        : Promise.resolve(undefined),
      needsProductSeries
        ? this.ordersAggregates.productSalesSeries({
            ...current,
            granularity: range.granularity,
            timezone: range.timezone,
          })
        : Promise.resolve([]),
      needsPreviousProductSeries
        ? this.ordersAggregates.productSalesSeries({
            ...previous,
            granularity: range.granularity,
            timezone: range.timezone,
          })
        : Promise.resolve([]),
      selected.has(DashboardWidgetKey.BOOKINGS_BY_SOURCE)
        ? this.bookingsAggregates.countBySource(current)
        : Promise.resolve([]),
      selected.has(DashboardWidgetKey.BOOKINGS_HEATMAP)
        ? this.bookingsAggregates.heatmapByWeekdayHour(current, range.timezone)
        : Promise.resolve([]),
      needsStaff
        ? this.bookingsAggregates.countByStaff(current, REVENUE_STATUSES)
        : Promise.resolve([]),
      needsStaff
        ? this.bookingsAggregates.countByStaff(current, [
            BookingStatus.COMPLETED,
          ])
        : Promise.resolve([]),
      needsStaff
        ? this.ordersAggregates.productSalesByStaff(current)
        : Promise.resolve([]),
    ]);
    return {
      locationId,
      dto,
      range,
      bookingSnapshot,
      previousBookingSnapshot,
      bookingSeries,
      previousBookingSeries,
      productSnapshot,
      previousProductSnapshot,
      productSeries,
      previousProductSeries,
      sourceRows,
      heatmapCells,
      staffRevenueRows,
      staffCompletedRows,
      productStaffRows,
    };
  }

  private metricWidget(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
    input: {
      value: number;
      previousValue?: number;
      unit: MetricUnit;
      higherIsBetter: boolean;
      spark?: number[];
    },
    withCurrency: boolean,
  ): WidgetDto {
    const metric: WidgetMetricDto = this.metricFactory.build(input);
    return {
      key,
      kind: WidgetKind.METRIC,
      metric,
      meta: this.buildMeta(ctx, withCurrency),
    };
  }

  private buildMeta(
    ctx: DashboardReadContext,
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

function wants(
  selected: ReadonlySet<DashboardWidgetKey>,
  group: ReadonlySet<DashboardWidgetKey>,
): boolean {
  for (const key of group) if (selected.has(key)) return true;
  return false;
}

function windowRange(
  locationId: string,
  dto: DashboardWidgetsRequestDto,
  from: Date,
  to: Date,
) {
  return {
    locationId,
    from,
    to,
    staffId: dto.staffId,
    catalogItemId: dto.catalogItemId,
    categoryId: dto.categoryId,
  };
}

function sumCount(
  snap: AggregateSnapshot,
  statuses: BookingStatus[] | undefined,
): number {
  if (!statuses) return snap.totalCount;
  let sum = 0;
  for (const s of statuses) sum += snap.byStatus.get(s)?.count ?? 0;
  return sum;
}

function sumRevenue(
  snap: AggregateSnapshot,
  statuses: BookingStatus[] | undefined,
): Prisma.Decimal {
  if (!statuses) return snap.totalRevenue;
  let sum = MoneyService.decimal(0);
  for (const s of statuses) sum = sum.plus(snap.byStatus.get(s)?.revenue ?? 0);
  return sum;
}

function chartMoney(value: Prisma.Decimal): number {
  return Number(MoneyService.format(value));
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? +((part / whole) * 100).toFixed(1) : 0;
}

function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  let sum = MoneyService.decimal(0);
  for (const v of values) sum = sum.plus(v);
  return sum;
}

function commercialEventCount(
  completedBookings: number,
  productSales: ProductSalesSnapshot,
): number {
  return (
    completedBookings +
    productSales.standaloneOrderCount +
    productSales.extraLinkedBookingCount
  );
}

function collapseSeries(
  rows: SeriesRow[],
  statuses?: BookingStatus[],
): SeriesRow[] {
  const byBucket = new Map<number, SeriesRow>();
  for (const row of rows) {
    if (statuses && (row.status == null || !statuses.includes(row.status))) {
      continue;
    }
    const key = row.bucket.getTime();
    const existing = byBucket.get(key);
    if (existing) {
      existing.count += row.count;
      existing.revenue = existing.revenue.plus(row.revenue);
      existing.duration += row.duration;
    } else {
      byBucket.set(key, { ...row, status: null });
    }
  }
  return [...byBucket.values()];
}

function emptySnapshot(): AggregateSnapshot {
  return {
    byStatus: new Map(),
    totalCount: 0,
    totalRevenue: MoneyService.decimal(0),
    totalDuration: 0,
  };
}

function emptyProductSnapshot(): ProductSalesSnapshot {
  return {
    revenue: MoneyService.decimal(0),
    standaloneOrderCount: 0,
    extraLinkedBookingCount: 0,
  };
}

function mergeRevenueSeries(
  bookingRows: SeriesRow[],
  productRows: ProductSalesSeriesRow[],
): SeriesRow[] {
  const byBucket = new Map<number, SeriesRow>();
  for (const row of bookingRows) {
    const key = row.bucket.getTime();
    const existing = byBucket.get(key);
    if (existing) {
      existing.revenue = existing.revenue.plus(row.revenue);
      existing.count += row.count;
      existing.duration += row.duration;
    } else {
      byBucket.set(key, { ...row, status: null });
    }
  }
  for (const row of productRows) {
    const key = row.bucket.getTime();
    const existing = byBucket.get(key);
    if (existing) {
      existing.revenue = existing.revenue.plus(row.revenue);
    } else {
      byBucket.set(key, {
        bucket: row.bucket,
        status: null,
        count: 0,
        revenue: row.revenue,
        duration: 0,
      });
    }
  }
  return [...byBucket.values()].sort(
    (left, right) => left.bucket.getTime() - right.bucket.getTime(),
  );
}

function sourceLabel(s: BookingSource): string {
  switch (s) {
    case BookingSource.PUBLIC_PAGE:
      return 'Public page';
    case BookingSource.WIDGET:
      return 'Widget';
    case BookingSource.MANUAL:
      return 'Manual';
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}
