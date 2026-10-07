import { Prisma } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingsAggregatesService } from '../../bookings/bookings-aggregates.service.js';
import { ClientRecencyBucket } from '../../bookings/enums/client-recency-bucket.enum.js';
import { ClientCohortBucket } from '../../bookings/interfaces/client-cohort-bucket.interface.js';
import { ClientCohortSummary } from '../../bookings/interfaces/client-cohort-summary.interface.js';
import { ClientRecencyRow } from '../../bookings/interfaces/client-recency-row.interface.js';
import { WidgetDto } from '../../dashboard/dto/widget.dto.js';
import { MetricGrowth } from '../../dashboard/enums/metric-growth.enum.js';
import { MetricUnit } from '../../dashboard/enums/metric-unit.enum.js';
import { SeriesGranularity } from '../../dashboard/enums/series-granularity.enum.js';
import { WidgetKind } from '../../dashboard/enums/widget-kind.enum.js';
import { ResolvedBrandRange } from '../../dashboard/interfaces/resolved-brand-range.interface.js';
import { DashboardBucketService } from '../../dashboard/services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from '../../dashboard/services/dashboard-metric.factory.js';
import { DashboardRangeService } from '../../dashboard/services/dashboard-range.service.js';
import { OrdersAnalyticsService } from '../../orders/analytics/orders-analytics.service.js';
import { ClientsAnalyticsService } from './clients-analytics.service.js';
import { ClientsAnalyticsRequestDto } from './dto/clients-analytics-request.dto.js';
import { ClientsAnalyticsWidgetKey } from './enums/clients-analytics-widget-key.enum.js';

function summary(
  overrides: Partial<ClientCohortSummary> = {},
): ClientCohortSummary {
  return {
    newVisits: 0,
    returningVisits: 0,
    activeClients: 0,
    revenue: MoneyService.decimal(0),
    ...overrides,
  };
}

function bucket(
  isoDay: string,
  overrides: Partial<ClientCohortBucket> = {},
): ClientCohortBucket {
  return {
    bucket: new Date(`${isoDay}T00:00:00.000Z`),
    newVisits: 0,
    returningVisits: 0,
    activeClients: 0,
    revenue: MoneyService.decimal(0),
    ...overrides,
  };
}

function recency(
  bucketKey: ClientRecencyBucket,
  clients: number,
  visits: number,
  revenue: string,
): ClientRecencyRow {
  return {
    bucket: bucketKey,
    clients,
    visits,
    revenue: new Prisma.Decimal(revenue),
  };
}

describe('ClientsAnalyticsService', () => {
  const aggregates = {
    clientCohortSummary: vi.fn(),
    clientCohortSeries: vi.fn(),
    clientRecency: vi.fn(),
    clientRevenue: vi.fn(),
    clientRevenueSeries: vi.fn(),
  };
  const ordersAnalytics = {
    clientRevenue: vi.fn(),
    clientRevenueSeries: vi.fn(),
  };
  const rangeService = { resolveForBrand: vi.fn() };
  const bucketService = new DashboardBucketService();

  let range: ResolvedBrandRange;
  let service: ClientsAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    range = {
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-04T00:00:00.000Z'),
      previousFrom: new Date('2026-08-29T00:00:00.000Z'),
      previousTo: new Date('2026-09-01T00:00:00.000Z'),
      granularity: SeriesGranularity.DAY,
      timezone: 'UTC',
      currency: 'USD',
      compareWithPrevious: true,
      locationIds: ['location-1'],
    };
    rangeService.resolveForBrand.mockResolvedValue(range);
    aggregates.clientCohortSummary.mockResolvedValue(summary());
    aggregates.clientCohortSeries.mockResolvedValue([]);
    aggregates.clientRecency.mockResolvedValue([]);
    aggregates.clientRevenue.mockResolvedValue([]);
    aggregates.clientRevenueSeries.mockResolvedValue([]);
    ordersAnalytics.clientRevenue.mockResolvedValue([]);
    ordersAnalytics.clientRevenueSeries.mockResolvedValue([]);
    service = new ClientsAnalyticsService(
      aggregates as unknown as BookingsAggregatesService,
      ordersAnalytics as unknown as OrdersAnalyticsService,
      rangeService as unknown as DashboardRangeService,
      new DashboardMetricFactory(),
      bucketService,
    );
  });

  async function widgets(
    keys: ClientsAnalyticsWidgetKey[],
  ): Promise<WidgetDto[]> {
    return service.getWidgets('biz', { keys } as ClientsAnalyticsRequestDto);
  }

  it('counts first completed visits and fills empty spark buckets with zeros', async () => {
    aggregates.clientCohortSummary
      .mockResolvedValueOnce(summary({ newVisits: 5 }))
      .mockResolvedValueOnce(summary({ newVisits: 2 }));
    aggregates.clientCohortSeries.mockResolvedValueOnce([
      bucket('2026-09-02', { newVisits: 2 }),
    ]);

    const [widget] = await widgets([ClientsAnalyticsWidgetKey.NEW_CLIENTS]);

    expect(widget.kind).toBe(WidgetKind.METRIC);
    expect(widget.metric).toMatchObject({
      value: 5,
      previousValue: 2,
      deltaAbs: 3,
      deltaPct: 150,
      unit: MetricUnit.COUNT,
      growth: MetricGrowth.UP,
      higherIsBetter: true,
      spark: [0, 2, 0],
    });
    expect(widget.meta?.currency).toBeUndefined();
    expect(widget.meta?.period).toEqual({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
  });

  it('reports the returning-visit share and a stable new/returning series', async () => {
    aggregates.clientCohortSummary
      .mockResolvedValueOnce(summary({ newVisits: 2, returningVisits: 1 }))
      .mockResolvedValueOnce(summary({ newVisits: 1, returningVisits: 1 }));
    aggregates.clientCohortSeries
      .mockResolvedValueOnce([
        bucket('2026-09-01', { newVisits: 2, returningVisits: 1 }),
      ])
      .mockResolvedValueOnce([
        bucket('2026-08-29', { newVisits: 1, returningVisits: 1 }),
      ]);

    const [widget] = await widgets([
      ClientsAnalyticsWidgetKey.REPEAT_VISIT_SHARE,
    ]);

    expect(widget.kind).toBe(WidgetKind.SERIES);
    expect(widget.metric).toMatchObject({
      value: 33.3,
      previousValue: 50,
      unit: MetricUnit.PERCENT,
      higherIsBetter: true,
    });
    expect(widget.series?.points).toEqual([
      { t: '2026-09-01T00:00:00.000Z', values: { new: 2, returning: 1 } },
      { t: '2026-09-02T00:00:00.000Z', values: { new: 0, returning: 0 } },
      { t: '2026-09-03T00:00:00.000Z', values: { new: 0, returning: 0 } },
    ]);
    expect(widget.series?.comparisonPoints?.[0]).toEqual({
      t: '2026-08-29T00:00:00.000Z',
      values: { new: 1, returning: 1 },
    });
  });

  it('returns a zero repeat share when the period has no completed visits', async () => {
    const [widget] = await widgets([
      ClientsAnalyticsWidgetKey.REPEAT_VISIT_SHARE,
    ]);
    expect(widget.metric?.value).toBe(0);
    expect(
      widget.series?.points.every(
        (point) => point.values.new === 0 && point.values.returning === 0,
      ),
    ).toBe(true);
  });

  it('counts only clients silent for 60 days or more, and still charts the 30-day bucket', async () => {
    aggregates.clientRecency
      .mockResolvedValueOnce([
        recency(ClientRecencyBucket.DAYS_90_PLUS, 2, 4, '100.00'),
        recency(ClientRecencyBucket.DAYS_30_60, 1, 1, '10.00'),
        recency(ClientRecencyBucket.DAYS_60_90, 1, 2, '50.00'),
      ])
      .mockResolvedValueOnce([
        recency(ClientRecencyBucket.DAYS_60_90, 5, 5, '25.00'),
      ]);

    const [widget] = await widgets([ClientsAnalyticsWidgetKey.DORMANT_CLIENTS]);

    expect(widget.kind).toBe(WidgetKind.BREAKDOWN);
    expect(widget.metric).toMatchObject({
      value: 3,
      previousValue: 5,
      deltaAbs: -2,
      growth: MetricGrowth.DOWN,
      higherIsBetter: false,
      unit: MetricUnit.COUNT,
    });
    expect(widget.breakdown).toEqual({
      dimension: 'recency',
      total: 4,
      items: [
        {
          id: ClientRecencyBucket.DAYS_30_60,
          label: '30–60 days',
          value: 1,
          secondaryValue: 10,
          sharePct: 25,
        },
        {
          id: ClientRecencyBucket.DAYS_60_90,
          label: '60–90 days',
          value: 1,
          secondaryValue: 25,
          sharePct: 25,
        },
        {
          id: ClientRecencyBucket.DAYS_90_PLUS,
          label: '90+ days',
          value: 2,
          secondaryValue: 25,
          sharePct: 50,
        },
      ],
    });
    expect(widget.meta?.currency).toBe('USD');
    expect(aggregates.clientRecency).toHaveBeenNthCalledWith(
      1,
      'biz',
      range.to,
      'UTC',
    );
    expect(aggregates.clientRecency).toHaveBeenNthCalledWith(
      2,
      'biz',
      range.previousTo,
      'UTC',
    );
    expect(aggregates.clientCohortSummary).not.toHaveBeenCalled();
  });

  it('keeps every recency bucket when nobody is silent', async () => {
    const [widget] = await widgets([ClientsAnalyticsWidgetKey.DORMANT_CLIENTS]);
    expect(widget.metric?.value).toBe(0);
    expect(widget.breakdown?.items.map((item) => item.value)).toEqual([
      0, 0, 0,
    ]);
    expect(widget.breakdown?.total).toBe(0);
  });

  it('divides period revenue by distinct clients, not by the sum of bucket clients', async () => {
    aggregates.clientCohortSummary.mockResolvedValueOnce(
      summary({
        activeClients: 2,
        revenue: new Prisma.Decimal('10.00'),
      }),
    );
    aggregates.clientCohortSeries.mockResolvedValueOnce([
      bucket('2026-09-01', {
        activeClients: 2,
        revenue: new Prisma.Decimal('6.00'),
      }),
      bucket('2026-09-02', {
        activeClients: 1,
        revenue: new Prisma.Decimal('4.00'),
      }),
    ]);
    aggregates.clientRevenue
      .mockResolvedValueOnce([
        { clientId: 'client-1', revenue: MoneyService.decimal('6.00') },
        { clientId: 'client-2', revenue: MoneyService.decimal('4.00') },
      ])
      .mockResolvedValueOnce([]);
    aggregates.clientRevenueSeries.mockResolvedValueOnce([
      {
        bucket: new Date('2026-09-01T00:00:00.000Z'),
        clientId: 'client-1',
        revenue: MoneyService.decimal('3.00'),
      },
      {
        bucket: new Date('2026-09-01T00:00:00.000Z'),
        clientId: 'client-2',
        revenue: MoneyService.decimal('3.00'),
      },
      {
        bucket: new Date('2026-09-02T00:00:00.000Z'),
        clientId: 'client-1',
        revenue: MoneyService.decimal('4.00'),
      },
    ]);

    const [widget] = await widgets([
      ClientsAnalyticsWidgetKey.REVENUE_PER_CLIENT,
    ]);

    expect(widget.metric).toMatchObject({
      value: 5,
      unit: MetricUnit.CURRENCY,
      higherIsBetter: true,
      spark: [3, 4, 0],
    });
    expect(widget.meta?.currency).toBe('USD');
    expect(aggregates.clientRecency).not.toHaveBeenCalled();
  });

  it('quantizes revenue per client half-up and returns zero when nobody visited', async () => {
    aggregates.clientCohortSummary.mockResolvedValueOnce(
      summary({
        activeClients: 3,
        revenue: new Prisma.Decimal('10.00'),
      }),
    );
    aggregates.clientRevenue.mockResolvedValueOnce([
      { clientId: 'client-1', revenue: MoneyService.decimal('3.34') },
      { clientId: 'client-2', revenue: MoneyService.decimal('3.33') },
      { clientId: 'client-3', revenue: MoneyService.decimal('3.33') },
    ]);
    const [uneven] = await widgets([
      ClientsAnalyticsWidgetKey.REVENUE_PER_CLIENT,
    ]);
    expect(uneven.metric?.value).toBe(3.33);

    aggregates.clientCohortSummary.mockResolvedValueOnce(summary());
    const [empty] = await widgets([
      ClientsAnalyticsWidgetKey.REVENUE_PER_CLIENT,
    ]);
    expect(empty.metric?.value).toBe(0);
  });

  it('merges service and product revenue by client without double-counting the client', async () => {
    aggregates.clientRevenue
      .mockResolvedValueOnce([
        { clientId: 'shared', revenue: MoneyService.decimal('100.00') },
      ])
      .mockResolvedValueOnce([]);
    ordersAnalytics.clientRevenue
      .mockResolvedValueOnce([
        { clientId: 'shared', revenue: MoneyService.decimal('25.00') },
        { clientId: 'product-only', revenue: MoneyService.decimal('75.00') },
      ])
      .mockResolvedValueOnce([]);

    const [widget] = await widgets([
      ClientsAnalyticsWidgetKey.REVENUE_PER_CLIENT,
    ]);

    expect(widget.metric?.value).toBe(100);
  });

  it('skips the previous period when comparison is off', async () => {
    range.compareWithPrevious = false;
    const result = await widgets([
      ClientsAnalyticsWidgetKey.NEW_CLIENTS,
      ClientsAnalyticsWidgetKey.REPEAT_VISIT_SHARE,
      ClientsAnalyticsWidgetKey.DORMANT_CLIENTS,
    ]);

    expect(aggregates.clientCohortSummary).toHaveBeenCalledTimes(1);
    expect(aggregates.clientCohortSeries).toHaveBeenCalledTimes(1);
    expect(aggregates.clientRecency).toHaveBeenCalledTimes(1);
    expect(
      result.every((widget) => widget.metric?.previousValue === undefined),
    ).toBe(true);
    expect(
      result.every((widget) => widget.meta?.previousPeriod === undefined),
    ).toBe(true);
    expect(
      result.find(
        (widget) => widget.key === ClientsAnalyticsWidgetKey.REPEAT_VISIT_SHARE,
      )?.series?.comparisonPoints,
    ).toBeUndefined();
  });

  it('returns widgets in the requested order and loads cohort data for every non-dormant key', async () => {
    const keys = [
      ClientsAnalyticsWidgetKey.REVENUE_PER_CLIENT,
      ClientsAnalyticsWidgetKey.DORMANT_CLIENTS,
      ClientsAnalyticsWidgetKey.NEW_CLIENTS,
    ];
    const result = await widgets(keys);
    expect(result.map((widget) => widget.key)).toEqual(keys);

    for (const key of Object.values(ClientsAnalyticsWidgetKey)) {
      vi.clearAllMocks();
      rangeService.resolveForBrand.mockResolvedValue(range);
      aggregates.clientCohortSummary.mockResolvedValue(summary());
      aggregates.clientCohortSeries.mockResolvedValue([]);
      aggregates.clientRecency.mockResolvedValue([]);
      await widgets([key]);
      if (key === ClientsAnalyticsWidgetKey.DORMANT_CLIENTS) {
        expect(aggregates.clientRecency).toHaveBeenCalled();
        expect(aggregates.clientCohortSummary).not.toHaveBeenCalled();
      } else {
        expect(aggregates.clientCohortSummary).toHaveBeenCalled();
        expect(aggregates.clientCohortSeries).toHaveBeenCalled();
        expect(aggregates.clientRecency).not.toHaveBeenCalled();
      }
    }
  });
});
