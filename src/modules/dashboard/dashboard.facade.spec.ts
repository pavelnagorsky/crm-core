import { BookingStatus } from '@prisma/client';
import { MoneyUtils } from '../../shared/money/money.utils.js';
import { BookingsAggregatesService } from '../bookings/aggregates/services/bookings-aggregates.service.js';
import { AggregateSnapshot } from '../bookings/interfaces/aggregate-snapshot.interface.js';
import { OrdersAggregatesService } from '../orders/analytics/services/orders-aggregates.service.js';
import { DashboardFacade } from './dashboard.facade.js';
import { DashboardWidgetsRequestDto } from './dto/dashboard-widgets-request.dto.js';
import { DashboardWidgetKey } from './enums/dashboard-widget-key.enum.js';
import { SeriesGranularity } from './enums/series-granularity.enum.js';
import { DashboardBucketFactory } from './factories/dashboard-bucket.factory.js';
import { DashboardMetricFactory } from './factories/dashboard-metric.factory.js';
import { DashboardSeriesFactory } from './factories/dashboard-series.factory.js';
import { DashboardWidgetFactory } from './factories/dashboard-widget.factory.js';
import { ResolvedRange } from './interfaces/resolved-range.interface.js';
import { DashboardContextService } from './services/dashboard-context.service.js';
import { DashboardRangeService } from './services/dashboard-range.service.js';

function bookingSnapshot(): AggregateSnapshot {
  return {
    byStatus: new Map([
      [
        BookingStatus.COMPLETED,
        { count: 2, revenue: MoneyUtils.decimal('100.00'), duration: 120 },
      ],
      [
        BookingStatus.CONFIRMED,
        { count: 1, revenue: MoneyUtils.decimal('50.00'), duration: 60 },
      ],
    ]),
    totalCount: 3,
    totalRevenue: MoneyUtils.decimal('150.00'),
    totalDuration: 180,
  };
}

describe('DashboardFacade product revenue', () => {
  const range: ResolvedRange = {
    from: new Date('2026-10-01T00:00:00.000Z'),
    to: new Date('2026-10-02T00:00:00.000Z'),
    previousFrom: new Date('2026-09-30T00:00:00.000Z'),
    previousTo: new Date('2026-10-01T00:00:00.000Z'),
    granularity: SeriesGranularity.DAY,
    timezone: 'UTC',
    currency: 'USD',
    compareWithPrevious: false,
  };
  const rangeService = { resolve: vi.fn().mockResolvedValue(range) };
  const bookings = {
    snapshot: vi.fn().mockResolvedValue(bookingSnapshot()),
    series: vi.fn().mockResolvedValue([]),
  };
  const orders = {
    productSalesSnapshot: vi.fn().mockResolvedValue({
      revenue: MoneyUtils.decimal('25.00'),
      standaloneOrderCount: 1,
      extraLinkedBookingCount: 1,
    }),
    productSalesSeries: vi.fn().mockResolvedValue([]),
  };

  function service(): DashboardFacade {
    const buckets = new DashboardBucketFactory();
    return new DashboardFacade(
      rangeService as unknown as DashboardRangeService,
      new DashboardContextService(
        bookings as unknown as BookingsAggregatesService,
        orders as unknown as OrdersAggregatesService,
      ),
      new DashboardWidgetFactory(
        new DashboardMetricFactory(),
        new DashboardSeriesFactory(buckets),
        buckets,
      ),
    );
  }

  it('adds posted product sales to forecast and actual revenue', async () => {
    const result = await service().getWidgets('location-1', {
      keys: [
        DashboardWidgetKey.REVENUE_TOTAL,
        DashboardWidgetKey.REVENUE_COMPLETED,
      ],
    } as DashboardWidgetsRequestDto);

    expect(result[0].metric?.value).toBe(175);
    expect(result[1].metric?.value).toBe(125);
    expect(bookings.snapshot).toHaveBeenCalledTimes(1);
    expect(bookings.series).toHaveBeenCalledTimes(1);
    expect(orders.productSalesSnapshot).toHaveBeenCalledTimes(1);
    expect(orders.productSalesSeries).toHaveBeenCalledTimes(1);
  });

  it('counts a completed booking and linked product orders as one ticket', async () => {
    const [result] = await service().getWidgets('location-1', {
      keys: [DashboardWidgetKey.AVG_TICKET],
    } as DashboardWidgetsRequestDto);

    expect(result.metric?.value).toBe(31.25);
  });
});
