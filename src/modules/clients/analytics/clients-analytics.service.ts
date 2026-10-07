import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import { ClientRevenueBucket } from '../../../shared/interfaces/client-revenue-bucket.interface.js';
import { ClientRevenue } from '../../../shared/interfaces/client-revenue.interface.js';
import { BookingsAggregatesService } from '../../bookings/bookings-aggregates.service.js';
import {
  CLIENT_RECENCY_BOUNDS,
  isDormantRecencyBucket,
} from '../../bookings/client-recency.rules.js';
import { ClientRecencyBucket } from '../../bookings/enums/client-recency-bucket.enum.js';
import { ClientCohortBucket } from '../../bookings/interfaces/client-cohort-bucket.interface.js';
import { ClientCohortSummary } from '../../bookings/interfaces/client-cohort-summary.interface.js';
import { ClientRecencyRow } from '../../bookings/interfaces/client-recency-row.interface.js';
import { WidgetBreakdownDto } from '../../dashboard/dto/widget-breakdown.dto.js';
import { WidgetDto } from '../../dashboard/dto/widget.dto.js';
import { WidgetMetaDto } from '../../dashboard/dto/widget-meta.dto.js';
import { WidgetSeriesPointDto } from '../../dashboard/dto/widget-series-point.dto.js';
import { MetricUnit } from '../../dashboard/enums/metric-unit.enum.js';
import { WidgetKind } from '../../dashboard/enums/widget-kind.enum.js';
import { ResolvedRange } from '../../dashboard/interfaces/resolved-range.interface.js';
import { DashboardBucketService } from '../../dashboard/services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from '../../dashboard/services/dashboard-metric.factory.js';
import { DashboardRangeService } from '../../dashboard/services/dashboard-range.service.js';
import { OrdersAnalyticsService } from '../../orders/analytics/orders-analytics.service.js';
import { ClientsAnalyticsRequestDto } from './dto/clients-analytics-request.dto.js';
import { ClientsAnalyticsWidgetKey } from './enums/clients-analytics-widget-key.enum.js';
import { ClientAnalyticsContext } from './interfaces/client-analytics-context.interface.js';

const NEW_VISITS = 'new';
const RETURNING_VISITS = 'returning';

const COHORT_WIDGETS = new Set<ClientsAnalyticsWidgetKey>([
  ClientsAnalyticsWidgetKey.NEW_CLIENTS,
  ClientsAnalyticsWidgetKey.REPEAT_VISIT_SHARE,
  ClientsAnalyticsWidgetKey.REVENUE_PER_CLIENT,
]);

const RECENCY_LABEL: Record<ClientRecencyBucket, string> = {
  [ClientRecencyBucket.DAYS_30_60]: '30–60 days',
  [ClientRecencyBucket.DAYS_60_90]: '60–90 days',
  [ClientRecencyBucket.DAYS_90_PLUS]: '90+ days',
};

@Injectable()
export class ClientsAnalyticsService {
  constructor(
    private readonly aggregates: BookingsAggregatesService,
    private readonly ordersAnalytics: OrdersAnalyticsService,
    private readonly rangeService: DashboardRangeService,
    private readonly metricFactory: DashboardMetricFactory,
    private readonly buckets: DashboardBucketService,
  ) {}

  async getWidgets(
    brandId: string,
    dto: ClientsAnalyticsRequestDto,
  ): Promise<WidgetDto[]> {
    const ctx = await this.buildContext(brandId, dto);
    return dto.keys.map((key) => this.buildWidget(key, ctx));
  }

  private buildWidget(
    key: ClientsAnalyticsWidgetKey,
    ctx: ClientAnalyticsContext,
  ): WidgetDto {
    switch (key) {
      case ClientsAnalyticsWidgetKey.NEW_CLIENTS:
        return this.newClients(key, ctx);
      case ClientsAnalyticsWidgetKey.REPEAT_VISIT_SHARE:
        return this.repeatVisitShare(key, ctx);
      case ClientsAnalyticsWidgetKey.DORMANT_CLIENTS:
        return this.dormantClients(key, ctx);
      case ClientsAnalyticsWidgetKey.REVENUE_PER_CLIENT:
        return this.revenuePerClient(key, ctx);
      default: {
        const _exhaustive: never = key;
        throw new Error(
          `Unhandled clients-analytics widget key: ${_exhaustive}`,
        );
      }
    }
  }

  private newClients(
    key: ClientsAnalyticsWidgetKey,
    ctx: ClientAnalyticsContext,
  ): WidgetDto {
    const current = this.cohort(ctx);
    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value: current.newVisits,
        previousValue: ctx.previousCohort?.newVisits,
        unit: MetricUnit.COUNT,
        higherIsBetter: true,
        spark: this.spark(
          ctx.range,
          ctx.currentSeries,
          (row) => row?.newVisits ?? 0,
        ),
      }),
      meta: this.buildMeta(ctx, false),
    };
  }

  private repeatVisitShare(
    key: ClientsAnalyticsWidgetKey,
    ctx: ClientAnalyticsContext,
  ): WidgetDto {
    const current = this.cohort(ctx);
    return {
      key,
      kind: WidgetKind.SERIES,
      metric: this.metricFactory.build({
        value: visitShare(current),
        previousValue: ctx.previousCohort
          ? visitShare(ctx.previousCohort)
          : undefined,
        unit: MetricUnit.PERCENT,
        higherIsBetter: true,
      }),
      series: {
        granularity: ctx.range.granularity,
        points: this.mixPoints(
          ctx.range.from,
          ctx.range.to,
          ctx.currentSeries,
          ctx.range,
        ),
        comparisonPoints: ctx.range.compareWithPrevious
          ? this.mixPoints(
              ctx.range.previousFrom,
              ctx.range.previousTo,
              ctx.previousSeries,
              ctx.range,
            )
          : undefined,
      },
      meta: this.buildMeta(ctx, false),
    };
  }

  private dormantClients(
    key: ClientsAnalyticsWidgetKey,
    ctx: ClientAnalyticsContext,
  ): WidgetDto {
    return {
      key,
      kind: WidgetKind.BREAKDOWN,
      metric: this.metricFactory.build({
        value: dormantCount(ctx.currentRecency),
        previousValue: ctx.previousRecency
          ? dormantCount(ctx.previousRecency)
          : undefined,
        unit: MetricUnit.COUNT,
        higherIsBetter: false,
      }),
      breakdown: this.recencyBreakdown(ctx.currentRecency),
      meta: this.buildMeta(ctx, true),
    };
  }

  private revenuePerClient(
    key: ClientsAnalyticsWidgetKey,
    ctx: ClientAnalyticsContext,
  ): WidgetDto {
    const current = this.cohort(ctx);
    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value: moneyPer(current.revenue, current.activeClients),
        previousValue: ctx.previousCohort
          ? moneyPer(
              ctx.previousCohort.revenue,
              ctx.previousCohort.activeClients,
            )
          : undefined,
        unit: MetricUnit.CURRENCY,
        higherIsBetter: true,
        spark: this.spark(ctx.range, ctx.currentSeries, (row) =>
          moneyPer(
            row?.revenue ?? MoneyService.decimal(0),
            row?.activeClients ?? 0,
          ),
        ),
      }),
      meta: this.buildMeta(ctx, true),
    };
  }

  private async buildContext(
    brandId: string,
    dto: ClientsAnalyticsRequestDto,
  ): Promise<ClientAnalyticsContext> {
    const range = await this.rangeService.resolveForBrand(brandId, dto);
    const needsCohort = dto.keys.some((key) => COHORT_WIDGETS.has(key));
    const needsRecency = dto.keys.includes(
      ClientsAnalyticsWidgetKey.DORMANT_CLIENTS,
    );
    const needsRevenue = dto.keys.includes(
      ClientsAnalyticsWidgetKey.REVENUE_PER_CLIENT,
    );
    const compare = range.compareWithPrevious;

    const currentRange = { brandId, from: range.from, to: range.to };
    const previousRange = {
      brandId,
      from: range.previousFrom,
      to: range.previousTo,
    };

    let [
      currentCohort,
      previousCohort,
      currentSeries,
      previousSeries,
      currentRecency,
      previousRecency,
    ] = await Promise.all([
      needsCohort
        ? this.aggregates.clientCohortSummary(currentRange)
        : undefined,
      needsCohort && compare
        ? this.aggregates.clientCohortSummary(previousRange)
        : undefined,
      needsCohort
        ? this.aggregates.clientCohortSeries({
            ...currentRange,
            granularity: range.granularity,
            timezone: range.timezone,
          })
        : [],
      needsCohort && compare
        ? this.aggregates.clientCohortSeries({
            ...previousRange,
            granularity: range.granularity,
            timezone: range.timezone,
          })
        : [],
      needsRecency
        ? this.aggregates.clientRecency(brandId, range.to, range.timezone)
        : [],
      needsRecency && compare
        ? this.aggregates.clientRecency(
            brandId,
            range.previousTo,
            range.timezone,
          )
        : undefined,
    ]);

    if (needsRevenue) {
      const currentClientRange = {
        locationIds: range.locationIds,
        from: range.from,
        to: range.to,
      };
      const previousClientRange = {
        locationIds: range.locationIds,
        from: range.previousFrom,
        to: range.previousTo,
      };
      const [
        bookingCurrent,
        orderCurrent,
        bookingPrevious,
        orderPrevious,
        bookingCurrentSeries,
        orderCurrentSeries,
        bookingPreviousSeries,
        orderPreviousSeries,
      ] = await Promise.all([
        this.aggregates.clientRevenue(currentClientRange),
        this.ordersAnalytics.clientRevenue(currentClientRange),
        compare
          ? this.aggregates.clientRevenue(previousClientRange)
          : Promise.resolve([]),
        compare
          ? this.ordersAnalytics.clientRevenue(previousClientRange)
          : Promise.resolve([]),
        this.aggregates.clientRevenueSeries({
          ...currentClientRange,
          granularity: range.granularity,
          timezone: range.timezone,
        }),
        this.ordersAnalytics.clientRevenueSeries({
          ...currentClientRange,
          granularity: range.granularity,
          timezone: range.timezone,
        }),
        compare
          ? this.aggregates.clientRevenueSeries({
              ...previousClientRange,
              granularity: range.granularity,
              timezone: range.timezone,
            })
          : Promise.resolve([]),
        compare
          ? this.ordersAnalytics.clientRevenueSeries({
              ...previousClientRange,
              granularity: range.granularity,
              timezone: range.timezone,
            })
          : Promise.resolve([]),
      ]);
      currentCohort = mergeClientRevenueSummary(
        currentCohort,
        bookingCurrent,
        orderCurrent,
      );
      currentSeries = mergeClientRevenueSeries(
        currentSeries,
        bookingCurrentSeries,
        orderCurrentSeries,
      );
      if (compare) {
        previousCohort = mergeClientRevenueSummary(
          previousCohort,
          bookingPrevious,
          orderPrevious,
        );
        previousSeries = mergeClientRevenueSeries(
          previousSeries,
          bookingPreviousSeries,
          orderPreviousSeries,
        );
      }
    }

    return {
      range,
      currentCohort,
      previousCohort,
      currentSeries,
      previousSeries,
      currentRecency,
      previousRecency,
    };
  }

  private cohort(ctx: ClientAnalyticsContext): ClientCohortSummary {
    if (!ctx.currentCohort)
      throw new Error('Client cohort summary was not loaded');
    return ctx.currentCohort;
  }

  private recencyBreakdown(rows: ClientRecencyRow[]): WidgetBreakdownDto {
    const byBucket = new Map(rows.map((row) => [row.bucket, row]));
    const items = CLIENT_RECENCY_BOUNDS.map((bound) => {
      const row = byBucket.get(bound.bucket);
      return {
        id: bound.bucket,
        label: RECENCY_LABEL[bound.bucket],
        value: row?.clients ?? 0,
        secondaryValue: moneyPer(
          row?.revenue ?? MoneyService.decimal(0),
          row?.visits ?? 0,
        ),
      };
    });
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return {
      dimension: 'recency',
      total,
      items: items.map((item) => ({
        ...item,
        sharePct: sharePct(item.value, total),
      })),
    };
  }

  private spark(
    range: ResolvedRange,
    rows: ClientCohortBucket[],
    pick: (row: ClientCohortBucket | undefined) => number,
  ): number[] {
    const byBucket = indexByBucket(rows);
    return this.buckets
      .bucketStarts(range)
      .map((start) => pick(byBucket.get(start.getTime())));
  }

  private mixPoints(
    from: Date,
    to: Date,
    rows: ClientCohortBucket[],
    range: ResolvedRange,
  ): WidgetSeriesPointDto[] {
    const byBucket = indexByBucket(rows);
    const starts = this.buckets.bucketStartsForBounds(
      from,
      to,
      range.granularity,
      range.timezone,
    );
    return starts.map((start) => {
      const row = byBucket.get(start.getTime());
      return {
        t: start.toISOString(),
        values: {
          [NEW_VISITS]: row?.newVisits ?? 0,
          [RETURNING_VISITS]: row?.returningVisits ?? 0,
        },
      };
    });
  }

  private buildMeta(
    ctx: ClientAnalyticsContext,
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

function visitShare(summary: ClientCohortSummary): number {
  return ratio(
    summary.returningVisits,
    summary.newVisits + summary.returningVisits,
  );
}

function ratio(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function dormantCount(rows: ClientRecencyRow[]): number {
  return rows.reduce(
    (sum, row) => sum + (isDormantRecencyBucket(row.bucket) ? row.clients : 0),
    0,
  );
}

function moneyPer(total: Prisma.Decimal, count: number): number {
  if (count <= 0) return 0;
  return Number(MoneyService.format(MoneyService.quantize(total.div(count))));
}

function sharePct(part: number, total: number): number {
  return +ratio(part, total).toFixed(1);
}

function indexByBucket(
  rows: ClientCohortBucket[],
): Map<number, ClientCohortBucket> {
  return new Map(rows.map((row) => [row.bucket.getTime(), row]));
}

function mergeClientRevenueSummary(
  base: ClientCohortSummary | undefined,
  bookingRows: ClientRevenue[],
  orderRows: ClientRevenue[],
): ClientCohortSummary | undefined {
  if (!base) return undefined;
  const byClient = new Map<string, Prisma.Decimal>();
  for (const row of [...bookingRows, ...orderRows]) {
    byClient.set(
      row.clientId,
      (byClient.get(row.clientId) ?? MoneyService.decimal(0)).plus(row.revenue),
    );
  }
  return {
    ...base,
    activeClients: byClient.size,
    revenue: sumMoney(byClient.values()),
  };
}

function mergeClientRevenueSeries(
  base: ClientCohortBucket[],
  bookingRows: ClientRevenueBucket[],
  orderRows: ClientRevenueBucket[],
): ClientCohortBucket[] {
  const byBucketClient = new Map<number, Map<string, Prisma.Decimal>>();
  for (const row of [...bookingRows, ...orderRows]) {
    const key = row.bucket.getTime();
    const clients =
      byBucketClient.get(key) ?? new Map<string, Prisma.Decimal>();
    clients.set(
      row.clientId,
      (clients.get(row.clientId) ?? MoneyService.decimal(0)).plus(row.revenue),
    );
    byBucketClient.set(key, clients);
  }
  const baseByBucket = indexByBucket(base);
  const bucketKeys = new Set([
    ...baseByBucket.keys(),
    ...byBucketClient.keys(),
  ]);
  return [...bucketKeys]
    .sort((a, b) => a - b)
    .map((key) => {
      const existing = baseByBucket.get(key);
      const clients = byBucketClient.get(key) ?? new Map();
      return {
        bucket: new Date(key),
        newVisits: existing?.newVisits ?? 0,
        returningVisits: existing?.returningVisits ?? 0,
        activeClients: clients.size,
        revenue: sumMoney(clients.values()),
      };
    });
}

function sumMoney(values: Iterable<Prisma.Decimal>): Prisma.Decimal {
  let total = MoneyService.decimal(0);
  for (const value of values) total = total.plus(value);
  return total;
}
