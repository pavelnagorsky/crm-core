import { BookingStatus, Prisma, StaffShift } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingsAggregatesService } from '../aggregates/bookings-aggregates.service.js';
import { AggregateRange } from '../interfaces/aggregate-range.interface.js';
import { AggregateSnapshot } from '../interfaces/aggregate-snapshot.interface.js';
import { StaffService } from '../../staff/staff.service.js';
import { MetricGrowth } from '../../dashboard/enums/metric-growth.enum.js';
import { MetricUnit } from '../../dashboard/enums/metric-unit.enum.js';
import { SeriesGranularity } from '../../dashboard/enums/series-granularity.enum.js';
import { WidgetKind } from '../../dashboard/enums/widget-kind.enum.js';
import { ResolvedRange } from '../../dashboard/interfaces/resolved-range.interface.js';
import { DashboardBucketService } from '../../dashboard/services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from '../../dashboard/services/dashboard-metric.factory.js';
import { DashboardRangeService } from '../../dashboard/services/dashboard-range.service.js';
import { DashboardSeriesFactory } from '../../dashboard/services/dashboard-series.factory.js';
import { BookingsAnalyticsService } from './bookings-analytics.service.js';
import { BookingsAnalyticsRequestDto } from './dto/bookings-analytics-request.dto.js';
import { BookingsAnalyticsWidgetKey } from './enums/bookings-analytics-widget-key.enum.js';

function snapshot(
  counts: Partial<
    Record<
      BookingStatus,
      { count?: number; duration?: number; revenue?: string }
    >
  > = {},
): AggregateSnapshot {
  const byStatus = new Map<
    BookingStatus,
    { count: number; revenue: Prisma.Decimal; duration: number }
  >();
  let totalCount = 0;
  let totalDuration = 0;
  let totalRevenue = MoneyService.decimal(0);
  for (const [status, v] of Object.entries(counts)) {
    const entry = {
      count: v?.count ?? 0,
      duration: v?.duration ?? 0,
      revenue: MoneyService.decimal(v?.revenue),
    };
    byStatus.set(status as BookingStatus, entry);
    totalCount += entry.count;
    totalDuration += entry.duration;
    totalRevenue = totalRevenue.plus(entry.revenue);
  }
  return { byStatus, totalCount, totalRevenue, totalDuration };
}

function lost(total: string): Prisma.Decimal {
  return MoneyService.decimal(total);
}

function shift(
  date: string,
  startTime: string,
  endTime: string,
  staffId = 'staff-1',
): StaffShift {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return {
    id: `${staffId}-${date}`,
    staffId,
    date: new Date(`${date}T00:00:00.000Z`),
    startTime: new Date(Date.UTC(1970, 0, 1, sh, sm)),
    endTime: new Date(Date.UTC(1970, 0, 1, eh, em)),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('BookingsAnalyticsService', () => {
  const aggregates = {
    snapshot: vi.fn(),
    series: vi.fn(),
    lostRevenue: vi.fn(),
    occupancyBookedMinutes: vi.fn(),
  };
  const rangeService = { resolve: vi.fn() };
  const staffService = { listShiftsInRange: vi.fn() };
  const bucketService = new DashboardBucketService();

  let range: ResolvedRange;
  let service: BookingsAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    // A fully-past window so "visits held" caps at range.to, not at now.
    range = {
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-04T00:00:00.000Z'),
      previousFrom: new Date('2026-08-29T00:00:00.000Z'),
      previousTo: new Date('2026-09-01T00:00:00.000Z'),
      granularity: SeriesGranularity.DAY,
      timezone: 'UTC',
      currency: 'USD',
      compareWithPrevious: true,
    };
    rangeService.resolve.mockResolvedValue(range);
    aggregates.snapshot.mockResolvedValue(snapshot());
    aggregates.series.mockResolvedValue([]);
    aggregates.lostRevenue.mockResolvedValue(lost('0'));
    aggregates.occupancyBookedMinutes.mockResolvedValue({
      pastHeldMinutes: 0,
      futureConfirmedMinutes: 0,
    });
    staffService.listShiftsInRange.mockResolvedValue([]);
    service = new BookingsAnalyticsService(
      rangeService as unknown as DashboardRangeService,
      aggregates as unknown as BookingsAggregatesService,
      staffService as unknown as StaffService,
      new DashboardMetricFactory(),
      new DashboardSeriesFactory(bucketService),
      bucketService,
    );
  });

  async function widgets(
    keys: BookingsAnalyticsWidgetKey[],
    overrides: Partial<BookingsAnalyticsRequestDto> = {},
  ) {
    return service.getWidgets('biz', {
      keys,
      ...overrides,
    } as BookingsAnalyticsRequestDto);
  }

  describe('OCCUPANCY', () => {
    it('divides booked hours by shift hours and reports both in an hours breakdown', async () => {
      // 2 shifts of 5h + 5h = 600 min capacity; booked 240 + 60 = 300 min → 50%.
      staffService.listShiftsInRange.mockResolvedValue([
        shift('2026-09-01', '09:00', '14:00'),
        shift('2026-09-02', '09:00', '14:00'),
      ]);
      aggregates.occupancyBookedMinutes.mockResolvedValue({
        pastHeldMinutes: 240,
        futureConfirmedMinutes: 60,
      });

      const [widget] = await widgets([BookingsAnalyticsWidgetKey.OCCUPANCY]);

      expect(widget.kind).toBe(WidgetKind.METRIC);
      expect(widget.metric).toMatchObject({
        value: 50,
        unit: MetricUnit.PERCENT,
        higherIsBetter: true,
      });
      expect(widget.breakdown).toEqual({
        dimension: 'hours',
        total: 10,
        items: [
          { id: 'booked', label: 'Booked', value: 5 },
          { id: 'capacity', label: 'Capacity', value: 10 },
        ],
      });
    });

    it('returns 0% and no divide-by-zero when there are no shifts', async () => {
      aggregates.occupancyBookedMinutes.mockResolvedValue({
        pastHeldMinutes: 120,
        futureConfirmedMinutes: 0,
      });
      const [widget] = await widgets([BookingsAnalyticsWidgetKey.OCCUPANCY]);
      expect(widget.metric?.value).toBe(0);
      expect(widget.breakdown?.total).toBe(0);
    });

    it('filters capacity to the requested staff member', async () => {
      staffService.listShiftsInRange.mockResolvedValue([
        shift('2026-09-01', '09:00', '14:00', 'staff-1'),
        shift('2026-09-01', '09:00', '19:00', 'staff-2'),
      ]);
      aggregates.occupancyBookedMinutes.mockResolvedValue({
        pastHeldMinutes: 150,
        futureConfirmedMinutes: 0,
      });

      const [widget] = await widgets([BookingsAnalyticsWidgetKey.OCCUPANCY], {
        staffId: 'staff-1',
      });

      // Only staff-1's 5h (300 min) counts as capacity → 150/300 = 50%.
      expect(widget.breakdown?.total).toBe(5);
      expect(widget.metric?.value).toBe(50);
    });

    it('builds the booked-hours spark from serviceDuration per bucket', async () => {
      staffService.listShiftsInRange.mockResolvedValue([
        shift('2026-09-01', '09:00', '19:00'),
      ]);
      aggregates.occupancyBookedMinutes.mockResolvedValue({
        pastHeldMinutes: 90,
        futureConfirmedMinutes: 0,
      });
      aggregates.series.mockResolvedValue([
        {
          bucket: new Date('2026-09-01T00:00:00.000Z'),
          status: null,
          count: 1,
          revenue: MoneyService.decimal(0),
          duration: 90,
        },
        {
          bucket: new Date('2026-09-03T00:00:00.000Z'),
          status: null,
          count: 1,
          revenue: MoneyService.decimal(0),
          duration: 30,
        },
      ]);

      const [widget] = await widgets([BookingsAnalyticsWidgetKey.OCCUPANCY]);

      // 3 daily buckets; duration/60 hours, empty bucket zero-filled. Previous window has no series.
      expect(aggregates.series).toHaveBeenCalledTimes(1);
      expect(widget.metric?.spark).toEqual([1.5, 0, 0.5]);
    });

    it('queries occupancy sources over the full range and shifts over its calendar days', async () => {
      await widgets([BookingsAnalyticsWidgetKey.OCCUPANCY]);
      expect(aggregates.occupancyBookedMinutes).toHaveBeenCalledTimes(2);
      expect(aggregates.series).toHaveBeenCalledTimes(1);
      const passedRange: AggregateRange =
        aggregates.occupancyBookedMinutes.mock.calls[0][0];
      expect(passedRange).toMatchObject({
        locationId: 'biz',
        from: range.from,
        to: range.to,
      });
      const previousRange: AggregateRange =
        aggregates.occupancyBookedMinutes.mock.calls[1][0];
      expect(previousRange).toMatchObject({
        locationId: 'biz',
        from: range.previousFrom,
        to: range.previousTo,
      });
      // Inclusive shift-date bounds: last day is range.to minus one day (2026-09-03), not 09-04.
      expect(staffService.listShiftsInRange).toHaveBeenNthCalledWith(
        1,
        'biz',
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-09-03T00:00:00.000Z'),
      );
      // Previous window 2026-08-29 inclusive through 2026-08-31 (previousTo minus one day).
      expect(staffService.listShiftsInRange).toHaveBeenNthCalledWith(
        2,
        'biz',
        new Date('2026-08-29T00:00:00.000Z'),
        new Date('2026-08-31T00:00:00.000Z'),
      );
    });

    it('resolves the shift-capacity window in the business timezone, not UTC', async () => {
      // For a +03:00 business, local 2026-09-01 00:00 is 2026-08-31T21:00Z. A UTC-component read
      // would wrongly land on 2026-08-31; the local-day resolution must keep it on 2026-09-01.
      range.timezone = 'Europe/Moscow';
      range.from = new Date('2026-08-31T21:00:00.000Z'); // 2026-09-01 00:00 local
      range.to = new Date('2026-09-02T21:00:00.000Z'); // 2026-09-03 00:00 local (exclusive)

      await widgets([BookingsAnalyticsWidgetKey.OCCUPANCY]);

      // Inclusive local bounds: 2026-09-01 .. 2026-09-02 (to minus one local day).
      expect(staffService.listShiftsInRange).toHaveBeenCalledWith(
        'biz',
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-09-02T00:00:00.000Z'),
      );
    });
  });

  describe('VISITS_HELD', () => {
    it('is held over completed+confirmed against all due outcomes', async () => {
      aggregates.snapshot.mockResolvedValue(
        snapshot({
          [BookingStatus.COMPLETED]: { count: 6 },
          [BookingStatus.CONFIRMED]: { count: 2 },
          [BookingStatus.CANCELLED]: { count: 1 },
          [BookingStatus.NO_SHOW]: { count: 1 },
          [BookingStatus.PENDING]: { count: 5 }, // pending is not "due", excluded from both sides
        }),
      );
      const [widget] = await widgets([BookingsAnalyticsWidgetKey.VISITS_HELD]);
      // (6+2) / (6+2+1+1) = 8/10 = 80%.
      expect(widget.metric).toMatchObject({
        value: 80,
        unit: MetricUnit.PERCENT,
        higherIsBetter: true,
      });
    });

    it('returns 0% when nothing was due in the period', async () => {
      const [widget] = await widgets([BookingsAnalyticsWidgetKey.VISITS_HELD]);
      expect(widget.metric?.value).toBe(0);
    });

    it('caps the snapshot upper bound at now for a period that runs into the future', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-09-02T12:00:00.000Z');
      vi.setSystemTime(now);
      range.to = new Date('2026-09-10T00:00:00.000Z'); // future end
      range.previousTo = new Date('2026-09-04T00:00:00.000Z'); // previous window also runs past now

      await widgets([BookingsAnalyticsWidgetKey.VISITS_HELD]);

      expect(aggregates.snapshot).toHaveBeenCalledTimes(2);
      const passedRange: AggregateRange = aggregates.snapshot.mock.calls[0][0];
      expect(passedRange.from).toEqual(range.from);
      expect(passedRange.to).toEqual(now);
      const previousRange: AggregateRange =
        aggregates.snapshot.mock.calls[1][0];
      expect(previousRange.from).toEqual(range.previousFrom);
      expect(previousRange.to).toEqual(now);
    });
  });

  describe('LOST_REVENUE', () => {
    it('reports total lost money without a cause breakdown', async () => {
      aggregates.lostRevenue.mockResolvedValue(lost('120.00'));
      const [widget] = await widgets([BookingsAnalyticsWidgetKey.LOST_REVENUE]);

      expect(widget.metric).toMatchObject({
        value: 120,
        unit: MetricUnit.CURRENCY,
        higherIsBetter: false,
      });
      expect(widget.meta?.currency).toBe('USD');
      expect(widget.breakdown).toBeUndefined();
    });

    it('returns zero when nothing was lost', async () => {
      const [widget] = await widgets([BookingsAnalyticsWidgetKey.LOST_REVENUE]);
      expect(widget.metric?.value).toBe(0);
      expect(widget.breakdown).toBeUndefined();
    });

    it('reports the drop against the previous period', async () => {
      aggregates.lostRevenue
        .mockResolvedValueOnce(lost('80'))
        .mockResolvedValueOnce(lost('100'));
      const [widget] = await widgets([BookingsAnalyticsWidgetKey.LOST_REVENUE]);

      expect(widget.metric).toMatchObject({
        value: 80,
        previousValue: 100,
        deltaPct: -20,
        growth: MetricGrowth.DOWN,
      });
    });
  });

  describe('PENDING_CONFIRMATION', () => {
    it('counts pending bookings over the full period as a count metric', async () => {
      aggregates.snapshot.mockResolvedValue(
        snapshot({ [BookingStatus.PENDING]: { count: 7 } }),
      );
      const [widget] = await widgets([
        BookingsAnalyticsWidgetKey.PENDING_CONFIRMATION,
      ]);
      expect(widget.kind).toBe(WidgetKind.METRIC);
      expect(widget.metric).toMatchObject({
        value: 7,
        unit: MetricUnit.COUNT,
        higherIsBetter: false,
      });
      expect(widget.metric?.previousValue).toBeUndefined();
      expect(aggregates.snapshot).toHaveBeenCalledTimes(1);
    });
  });

  describe('batching and shape', () => {
    it('returns widgets in the requested order', async () => {
      const keys = [
        BookingsAnalyticsWidgetKey.LOST_REVENUE,
        BookingsAnalyticsWidgetKey.OCCUPANCY,
        BookingsAnalyticsWidgetKey.PENDING_CONFIRMATION,
        BookingsAnalyticsWidgetKey.VISITS_HELD,
      ];
      const result = await widgets(keys);
      expect(result.map((w) => w.key)).toEqual(keys);
    });

    it('only issues the queries the requested widgets need', async () => {
      await widgets([BookingsAnalyticsWidgetKey.LOST_REVENUE]);
      expect(aggregates.lostRevenue).toHaveBeenCalledTimes(2);
      expect(aggregates.lostRevenue).toHaveBeenNthCalledWith(1, {
        locationId: 'biz',
        from: range.from,
        to: range.to,
      });
      expect(aggregates.lostRevenue).toHaveBeenNthCalledWith(2, {
        locationId: 'biz',
        from: range.previousFrom,
        to: range.previousTo,
      });
      expect(aggregates.occupancyBookedMinutes).not.toHaveBeenCalled();
      expect(staffService.listShiftsInRange).not.toHaveBeenCalled();
      expect(aggregates.snapshot).not.toHaveBeenCalled();
    });

    it('does not query the previous period when comparison is off', async () => {
      range.compareWithPrevious = false;
      const [widget] = await widgets([BookingsAnalyticsWidgetKey.LOST_REVENUE]);
      expect(aggregates.lostRevenue).toHaveBeenCalledTimes(1);
      expect(aggregates.lostRevenue).toHaveBeenCalledWith({
        locationId: 'biz',
        from: range.from,
        to: range.to,
      });
      expect(widget.metric?.previousValue).toBeUndefined();
    });

    it('compares occupancy, visits held and lost revenue with the previous period', async () => {
      const result = await widgets([
        BookingsAnalyticsWidgetKey.OCCUPANCY,
        BookingsAnalyticsWidgetKey.VISITS_HELD,
        BookingsAnalyticsWidgetKey.LOST_REVENUE,
        BookingsAnalyticsWidgetKey.PENDING_CONFIRMATION,
      ]);
      for (const key of [
        BookingsAnalyticsWidgetKey.OCCUPANCY,
        BookingsAnalyticsWidgetKey.VISITS_HELD,
        BookingsAnalyticsWidgetKey.LOST_REVENUE,
      ]) {
        expect(
          result.find((w) => w.key === key)?.metric?.previousValue,
        ).toEqual(expect.any(Number));
      }
      expect(
        result.find(
          (w) => w.key === BookingsAnalyticsWidgetKey.PENDING_CONFIRMATION,
        )?.metric?.previousValue,
      ).toBeUndefined();
    });
  });
});
