import { BookingStatus } from '@prisma/client';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { BookingsAggregatesService } from '../../../bookings/aggregates/services/bookings-aggregates.service.js';
import { AggregateSnapshot } from '../../../bookings/interfaces/aggregate-snapshot.interface.js';
import { MetricUnit } from '../../../dashboard/enums/metric-unit.enum.js';
import { SeriesGranularity } from '../../../dashboard/enums/series-granularity.enum.js';
import { WidgetKind } from '../../../dashboard/enums/widget-kind.enum.js';
import { DashboardBucketFactory } from '../../../dashboard/factories/dashboard-bucket.factory.js';
import { DashboardMetricFactory } from '../../../dashboard/factories/dashboard-metric.factory.js';
import { ResolvedBrandRange } from '../../../dashboard/interfaces/resolved-brand-range.interface.js';
import { DashboardRangeService } from '../../../dashboard/services/dashboard-range.service.js';
import { OrdersAggregatesService } from '../../../orders/aggregates/services/orders-aggregates.service.js';
import { ProductsAnalyticsRequestDto } from '../dto/products-analytics-request.dto.js';
import { ProductsAnalyticsWidgetKey } from '../enums/products-analytics-widget-key.enum.js';
import { ProductsAnalyticsWidgetFactory } from '../factories/products-analytics-widget.factory.js';
import { ProductsAnalyticsService } from './products-analytics.service.js';

function serviceSnapshot(revenue: string): AggregateSnapshot {
  return {
    byStatus: new Map([
      [
        BookingStatus.COMPLETED,
        {
          count: 1,
          revenue: MoneyUtils.decimal(revenue),
          duration: 60,
        },
      ],
    ]),
    totalCount: 1,
    totalRevenue: MoneyUtils.decimal(revenue),
    totalDuration: 60,
  };
}

describe('ProductsAnalyticsService', () => {
  const rangeService = { resolveForBrand: vi.fn() };
  const orders = {
    productSalesKpiSnapshot: vi.fn(),
    productSalesKpiSeries: vi.fn(),
    productRevenue: vi.fn(),
    productSalesSeries: vi.fn(),
  };
  const bookings = {
    snapshot: vi.fn(),
    series: vi.fn(),
  };
  const bucketService = new DashboardBucketFactory();
  const widgetFactory = new ProductsAnalyticsWidgetFactory(
    new DashboardMetricFactory(),
    bucketService,
  );

  let range: ResolvedBrandRange;
  let service: ProductsAnalyticsService;

  beforeEach(() => {
    vi.resetAllMocks();
    range = {
      locationIds: ['location-1', 'location-2'],
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-03T00:00:00.000Z'),
      previousFrom: new Date('2026-08-30T00:00:00.000Z'),
      previousTo: new Date('2026-09-01T00:00:00.000Z'),
      granularity: SeriesGranularity.DAY,
      timezone: 'UTC',
      currency: 'USD',
      compareWithPrevious: true,
    };
    rangeService.resolveForBrand.mockResolvedValue(range);
    orders.productSalesKpiSnapshot
      .mockResolvedValueOnce({
        revenue: MoneyUtils.decimal(300),
        grossProfit: MoneyUtils.decimal(120),
        buyerCount: 4,
        repeatBuyerCount: 2,
      })
      .mockResolvedValueOnce({
        revenue: MoneyUtils.decimal(150),
        grossProfit: MoneyUtils.decimal(90),
        buyerCount: 5,
        repeatBuyerCount: 1,
      });
    orders.productSalesKpiSeries.mockResolvedValue([
      {
        bucket: new Date('2026-09-01T00:00:00.000Z'),
        revenue: MoneyUtils.decimal(100),
        grossProfit: MoneyUtils.decimal(40),
        buyerCount: 2,
        repeatBuyerCount: 1,
      },
      {
        bucket: new Date('2026-09-02T00:00:00.000Z'),
        revenue: MoneyUtils.decimal(200),
        grossProfit: MoneyUtils.decimal(80),
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
        revenue: MoneyUtils.decimal(400),
        duration: 60,
      },
      {
        bucket: new Date('2026-09-02T00:00:00.000Z'),
        status: null,
        count: 1,
        revenue: MoneyUtils.decimal(300),
        duration: 60,
      },
    ]);
    service = new ProductsAnalyticsService(
      rangeService as unknown as DashboardRangeService,
      orders as unknown as OrdersAggregatesService,
      bookings as unknown as BookingsAggregatesService,
    );
  });

  async function widgets(
    keys: ProductsAnalyticsWidgetKey[],
    filters: Partial<ProductsAnalyticsRequestDto> = {},
  ) {
    const result = await service.getAnalytics('brand-1', {
      keys,
      staffId: 'staff-1',
      ...filters,
    } as ProductsAnalyticsRequestDto);
    return widgetFactory.build(keys, result);
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
    await widgets([ProductsAnalyticsWidgetKey.GROSS_PROFIT], {
      productId: 'product-1',
      categoryId: 'category-1',
    });

    expect(orders.productSalesKpiSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        locationIds: ['location-1', 'location-2'],
        catalogItemId: 'product-1',
        categoryId: 'category-1',
        staffId: 'staff-1',
      }),
    );
  });

  it('resolves the requested brand scope and returns the actual locations', async () => {
    range.locationIds = ['location-2'];
    const dto = {
      keys: [ProductsAnalyticsWidgetKey.REPEAT_PURCHASE_RATE],
      locationIds: ['location-2'],
    } as ProductsAnalyticsRequestDto;

    const result = await service.getAnalytics('brand-1', dto);

    expect(rangeService.resolveForBrand).toHaveBeenCalledWith('brand-1', dto, [
      'location-2',
    ]);
    expect(result.range.locationIds).toEqual(['location-2']);
    expect(orders.productSalesKpiSnapshot).toHaveBeenCalledTimes(2);
    for (const [range] of orders.productSalesKpiSnapshot.mock.calls) {
      expect(range.locationIds).toEqual(['location-2']);
    }
    expect(orders.productSalesKpiSeries.mock.calls[0][0].locationIds).toEqual([
      'location-2',
    ]);
  });

  it.each([
    { productId: 'product-1' },
    { categoryId: 'category-1' },
    { productId: 'product-1', categoryId: 'category-1' },
  ])('uses all revenue as the denominator for filters %j', async (filters) => {
    orders.productRevenue
      .mockResolvedValueOnce(MoneyUtils.decimal(600))
      .mockResolvedValueOnce(MoneyUtils.decimal(400));
    orders.productSalesSeries.mockResolvedValue([
      { bucket: range.from, revenue: MoneyUtils.decimal(200) },
      {
        bucket: new Date('2026-09-02T00:00:00.000Z'),
        revenue: MoneyUtils.decimal(400),
      },
    ]);

    const [widget] = await widgets(
      [ProductsAnalyticsWidgetKey.PRODUCT_REVENUE_SHARE],
      filters,
    );

    expect(widget.metric).toMatchObject({
      value: 23.1,
      previousValue: 20,
      spark: [16.6667, 28.5714],
    });
    for (const mock of [
      bookings.snapshot,
      bookings.series,
      orders.productRevenue,
      orders.productSalesSeries,
    ]) {
      for (const [aggregateRange] of mock.mock.calls) {
        expect(aggregateRange).toMatchObject({
          locationIds: ['location-1', 'location-2'],
          staffId: 'staff-1',
        });
        expect(aggregateRange).not.toHaveProperty('catalogItemId');
        expect(aggregateRange).not.toHaveProperty('categoryId');
      }
    }
  });

  it('reuses unfiltered product totals and skips comparison queries when disabled', async () => {
    range.compareWithPrevious = false;
    const [widget] = await widgets([
      ProductsAnalyticsWidgetKey.PRODUCT_REVENUE_SHARE,
    ]);

    expect(orders.productRevenue).not.toHaveBeenCalled();
    expect(orders.productSalesSeries).not.toHaveBeenCalled();
    expect(orders.productSalesKpiSnapshot).toHaveBeenCalledTimes(1);
    expect(bookings.snapshot).toHaveBeenCalledTimes(1);
    expect(widget.metric).not.toHaveProperty('previousValue');
    expect(widget.meta?.previousPeriod).toBeUndefined();
  });

  it('loads filtered revenue totals only for the current period when comparison is disabled', async () => {
    range.compareWithPrevious = false;
    orders.productRevenue.mockResolvedValue(MoneyUtils.decimal(600));
    orders.productSalesSeries.mockResolvedValue([]);
    const [widget] = await widgets(
      [ProductsAnalyticsWidgetKey.PRODUCT_REVENUE_SHARE],
      { categoryId: 'category-1' },
    );
    expect(orders.productRevenue).toHaveBeenCalledTimes(1);
    expect(orders.productRevenue).toHaveBeenCalledWith({
      locationIds: range.locationIds,
      from: range.from,
      to: range.to,
      staffId: 'staff-1',
    });
    expect(widget.metric).toMatchObject({ value: 23.1 });
    expect(widget.metric).not.toHaveProperty('previousValue');
  });

  it('keeps empty periods at zero with finite values and a previous-period comparison', async () => {
    orders.productSalesKpiSnapshot.mockReset().mockResolvedValue({
      revenue: MoneyUtils.decimal(0),
      grossProfit: MoneyUtils.decimal(0),
      buyerCount: 0,
      repeatBuyerCount: 0,
    });
    orders.productSalesKpiSeries.mockResolvedValue([]);
    bookings.snapshot.mockReset().mockResolvedValue(serviceSnapshot('0'));
    bookings.series.mockResolvedValue([]);
    const result = await widgets(Object.values(ProductsAnalyticsWidgetKey));
    for (const widget of result) {
      expect(widget.metric).toMatchObject({
        value: 0,
        previousValue: 0,
        spark: [0, 0],
      });
    }
  });

  it('does not query aggregates when scope resolution rejects the request', async () => {
    rangeService.resolveForBrand.mockRejectedValueOnce(
      new Error('Invalid locations'),
    );
    await expect(
      widgets([ProductsAnalyticsWidgetKey.GROSS_PROFIT]),
    ).rejects.toThrow('Invalid locations');
    expect(orders.productSalesKpiSnapshot).not.toHaveBeenCalled();
    expect(bookings.snapshot).not.toHaveBeenCalled();
  });
});
