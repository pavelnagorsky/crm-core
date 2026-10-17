import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import {
  CANCELLATION_DENOMINATOR,
  COMPLETION_DENOMINATOR,
  DEFAULT_TOP_N,
  NO_SHOW_DENOMINATOR,
  REVENUE_STATUSES,
} from '../constants/dashboard-widget.constants.js';
import { WidgetBreakdownItemDto } from '../dto/widget-breakdown-item.dto.js';
import { WidgetMetaDto } from '../dto/widget-meta.dto.js';
import { WidgetMetricDto } from '../dto/widget-metric.dto.js';
import { WidgetDto } from '../dto/widget.dto.js';
import { DashboardWidgetKey } from '../enums/dashboard-widget-key.enum.js';
import { MetricUnit } from '../enums/metric-unit.enum.js';
import { WidgetKind } from '../enums/widget-kind.enum.js';
import { DashboardReadContext } from '../interfaces/dashboard-read-context.interface.js';
import { MetricInput } from '../interfaces/metric-input.interface.js';
import {
  chartMoney,
  collapseSeries,
  commercialEventCount,
  mergeRevenueSeries,
  pct,
  ratio,
  sourceLabel,
  sumCount,
  sumDecimals,
  sumRevenue,
} from '../rules/dashboard-metrics.js';
import { DashboardBucketFactory } from './dashboard-bucket.factory.js';
import { DashboardMetricFactory } from './dashboard-metric.factory.js';
import { DashboardSeriesFactory } from './dashboard-series.factory.js';

@Injectable()
export class DashboardWidgetFactory {
  constructor(
    private readonly metricFactory: DashboardMetricFactory,
    private readonly seriesFactory: DashboardSeriesFactory,
    private readonly buckets: DashboardBucketFactory,
  ) {}
  build(key: DashboardWidgetKey, ctx: DashboardReadContext): WidgetDto {
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
        ? chartMoney(MoneyUtils.quantize(currRev.div(currCount)))
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
          ? chartMoney(MoneyUtils.quantize(prevRev.div(prevCount)))
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
        revenue: (current?.revenue ?? MoneyUtils.decimal(0)).plus(row.revenue),
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

  private metricWidget(
    key: DashboardWidgetKey,
    ctx: DashboardReadContext,
    input: MetricInput,
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
