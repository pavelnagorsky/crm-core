import { BookingStatus } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingsAggregatesService } from '../../bookings/aggregates/bookings-aggregates.service.js';
import { AggregateSnapshot } from '../../bookings/interfaces/aggregate-snapshot.interface.js';
import { DashboardBucketService } from '../../dashboard/services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from '../../dashboard/services/dashboard-metric.factory.js';
import { DashboardRangeService } from '../../dashboard/services/dashboard-range.service.js';
import { MetricUnit } from '../../dashboard/enums/metric-unit.enum.js';
import { SeriesGranularity } from '../../dashboard/enums/series-granularity.enum.js';
import { WidgetKind } from '../../dashboard/enums/widget-kind.enum.js';
import { ResolvedRange } from '../../dashboard/interfaces/resolved-range.interface.js';
import { OrdersAggregatesService } from '../../orders/analytics/orders-aggregates.service.js';
import { ProductsAnalyticsRequestDto } from './dto/products-analytics-request.dto.js';
import { ProductsAnalyticsWidgetKey } from './enums/products-analytics-widget-key.enum.js';
import { ProductsAnalyticsService } from './products-analytics.service.js';

function serviceSnapshot(revenue: string): AggregateSnapshot {
  return {
    byStatus: new Map([
      [
        BookingStatus.COMPLETED,
        {
          count: 1,
          revenue: MoneyService.decimal(revenue),
          duration: 60,
        },
      ],
    ]),
    totalCount: 1,
    totalRevenue: MoneyService.decimal(revenue),
    totalDuration: 60,
  };
}

describe('ProductsAnalyticsService', () => {
  const rangeService = { resolve: vi.fn() };
  const orders = {
    productSalesKpiSnapshot: vi.fn(),
    productSalesKpiSeries: vi.fn(),
  };
  const bookings = {
    snapshot: vi.fn(),
    series: vi.fn(),
  };
  const bucketService = new DashboardBucketService();

  let range: ResolvedRange;
  let service: ProductsAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    range = {
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-03T00:00:00.000Z'),
      previousFrom: new Date('2026-08-30T00:00:00.000Z'),
      previousTo: new Date('2026-09-01T00:00:00.000Z'),
      granularity: SeriesGranularity.DAY,
      timezone: 'UTC',
      currency: 'USD',
      compareWithPrevious: true,
    };
    rangeService.resolve.mockResolvedValue(range);
    orders.productSalesKpiSnapshot
      .mockResolvedValueOnce({
        revenue: MoneyService.decimal(300),
        grossProfit: MoneyService.decimal(120),
        buyerCount: 4,
        repeatBuyerCount: 2,
      })
      .mockResolvedValueOnce({
        revenue: MoneyService.decimal(150),
        grossProfit: MoneyService.decimal(90),
        buyerCount: 5,
        repeatBuyerCount: 1,
      });
    orders.productSalesKpiSeries.mockResolvedValue([
      {
        bucket: new Date('2026-09-01T00:00:00.000Z'),
        revenue: MoneyService.decimal(100),
        grossProfit: MoneyService.decimal(40),
        buyerCount: 2,
        repeatBuyerCount: 1,
      },
      {
        bucket: new Date('2026-09-02T00:00:00.000Z'),
        revenue: MoneyService.decimal(200),
        grossProfit: MoneyService.decimal(80),
        buyerCount: 2,
        repeatBuyerCount: 1,
      },
    ]);
    bookings.snapshot
      .mockResolvedValueOnce(serviceSnapshot('700'))
      .mockResolvedValueOnce(serviceSnapshot('350'));
    bookings.series.mockResolvedValue([
      {
        bucket: new Date('2026-09-01T00:00:00.000Z'),
        status: null,
        count: 1,
        revenue: MoneyService.decimal(400),
        duration: 60,
      },
      {
        bucket: new Date('2026-09-02T00:00:00.000Z'),
        status: null,
        count: 1,
        revenue: MoneyService.decimal(300),
        duration: 60,
      },
    ]);
    service = new ProductsAnalyticsService(
      rangeService as unknown as DashboardRangeService,
      orders as unknown as OrdersAggregatesService,
      bookings as unknown as BookingsAggregatesService,
      new DashboardMetricFactory(),
      bucketService,
    );
  });

  async function widgets(keys: ProductsAnalyticsWidgetKey[]) {
    return service.getWidgets('location-1', {
      keys,
      productId: 'product-1',
      categoryId: 'category-1',
      staffId: 'staff-1',
    } as ProductsAnalyticsRequestDto);
  }

  it('builds the three product KPI cards with previous-period comparison', async () => {
    const result = await widgets([
      ProductsAnalyticsWidgetKey.GROSS_PROFIT,
      ProductsAnalyticsWidgetKey.PRODUCT_REVENUE_SHARE,
      ProductsAnalyticsWidgetKey.REPEAT_PURCHASE_RATE,
    ]);

    expect(result.map((widget) => widget.key)).toEqual([
      ProductsAnalyticsWidgetKey.GROSS_PROFIT,
      ProductsAnalyticsWidgetKey.PRODUCT_REVENUE_SHARE,
      ProductsAnalyticsWidgetKey.REPEAT_PURCHASE_RATE,
    ]);
    expect(result[0]).toMatchObject({
      kind: WidgetKind.METRIC,
      metric: {
        value: 120,
        previousValue: 90,
        deltaAbs: 30,
        deltaPct: 33.3,
        unit: MetricUnit.CURRENCY,
        higherIsBetter: true,
        spark: [40, 80],
      },
      meta: { currency: 'USD' },
    });
    expect(result[1].metric).toMatchObject({
      value: 30,
      previousValue: 30,
      unit: MetricUnit.PERCENT,
      spark: [20, 40],
    });
    expect(result[2].metric).toMatchObject({
      value: 50,
      previousValue: 20,
      unit: MetricUnit.PERCENT,
      spark: [50, 50],
    });
  });

  it('does not load service revenue when product-revenue share is not requested', async () => {
    await widgets([
      ProductsAnalyticsWidgetKey.GROSS_PROFIT,
      ProductsAnalyticsWidgetKey.REPEAT_PURCHASE_RATE,
    ]);

    expect(bookings.snapshot).not.toHaveBeenCalled();
    expect(bookings.series).not.toHaveBeenCalled();
  });

  it('passes product filters into order aggregate ranges', async () => {
    await widgets([ProductsAnalyticsWidgetKey.GROSS_PROFIT]);

    expect(orders.productSalesKpiSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: 'location-1',
        catalogItemId: 'product-1',
        categoryId: 'category-1',
        staffId: 'staff-1',
      }),
    );
  });
});
