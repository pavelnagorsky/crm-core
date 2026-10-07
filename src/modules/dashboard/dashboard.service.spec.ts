import { BookingStatus } from '@prisma/client';
import { MoneyService } from '../../shared/money/money.service.js';
import { BookingsAggregatesService } from '../bookings/bookings-aggregates.service.js';
import { AggregateSnapshot } from '../bookings/interfaces/aggregate-snapshot.interface.js';
import { OrdersAnalyticsService } from '../orders/analytics/orders-analytics.service.js';
import { DashboardWidgetsRequestDto } from './dto/dashboard-widgets-request.dto.js';
import { DashboardWidgetKey } from './enums/dashboard-widget-key.enum.js';
import { SeriesGranularity } from './enums/series-granularity.enum.js';
import { ResolvedRange } from './interfaces/resolved-range.interface.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardBucketService } from './services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from './services/dashboard-metric.factory.js';
import { DashboardRangeService } from './services/dashboard-range.service.js';
import { DashboardSeriesFactory } from './services/dashboard-series.factory.js';

function bookingSnapshot(): AggregateSnapshot {
  return {
    byStatus: new Map([
      [
        BookingStatus.COMPLETED,
        { count: 2, revenue: MoneyService.decimal('100.00'), duration: 120 },
      ],
      [
        BookingStatus.CONFIRMED,
        { count: 1, revenue: MoneyService.decimal('50.00'), duration: 60 },
      ],
    ]),
    totalCount: 3,
    totalRevenue: MoneyService.decimal('150.00'),
    totalDuration: 180,
  };
}

describe('DashboardService product revenue', () => {
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
    completedBookingIds: vi.fn().mockResolvedValue(['booking-1', 'booking-2']),
  };
  const orders = {
    productSalesSnapshot: vi.fn().mockResolvedValue({
      revenue: MoneyService.decimal('25.00'),
      standaloneOrderCount: 1,
      linkedBookingIds: ['booking-1', 'booking-3'],
    }),
    productSalesSeries: vi.fn().mockResolvedValue([]),
  };

  function service(): DashboardService {
    const buckets = new DashboardBucketService();
    return new DashboardService(
      rangeService as unknown as DashboardRangeService,
      bookings as unknown as BookingsAggregatesService,
      orders as unknown as OrdersAnalyticsService,
      new DashboardMetricFactory(),
      new DashboardSeriesFactory(buckets),
      buckets,
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
  });

  it('counts a completed booking and linked product orders as one ticket', async () => {
    const [result] = await service().getWidgets('location-1', {
      keys: [DashboardWidgetKey.AVG_TICKET],
    } as DashboardWidgetsRequestDto);

    expect(result.metric?.value).toBe(31.25);
  });
});
