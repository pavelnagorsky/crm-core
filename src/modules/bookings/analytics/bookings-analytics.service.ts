import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, StaffShift } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import { TimeService } from '../../../shared/time/time.service.js';
import { StaffService } from '../../staff/staff.service.js';
import { BookingsAggregatesService } from '../aggregates/bookings-aggregates.service.js';
import { AggregateRange } from '../interfaces/aggregate-range.interface.js';
import { AggregateSnapshot } from '../interfaces/aggregate-snapshot.interface.js';
import { SeriesRow } from '../interfaces/series-row.interface.js';
import { WidgetDto } from '../../dashboard/dto/widget.dto.js';
import { WidgetMetaDto } from '../../dashboard/dto/widget-meta.dto.js';
import { MetricUnit } from '../../dashboard/enums/metric-unit.enum.js';
import { WidgetKind } from '../../dashboard/enums/widget-kind.enum.js';
import { ResolvedRange } from '../../dashboard/interfaces/resolved-range.interface.js';
import { DashboardBucketService } from '../../dashboard/services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from '../../dashboard/services/dashboard-metric.factory.js';
import { DashboardRangeService } from '../../dashboard/services/dashboard-range.service.js';
import { DashboardSeriesFactory } from '../../dashboard/services/dashboard-series.factory.js';
import { BookingsAnalyticsRequestDto } from './dto/bookings-analytics-request.dto.js';
import { BookingsAnalyticsWidgetKey } from './enums/bookings-analytics-widget-key.enum.js';
import { BookingsAnalyticsContext } from './interfaces/bookings-analytics-context.interface.js';
import { OccupancyData } from './interfaces/occupancy-data.interface.js';
import { OccupancyHeadline } from './interfaces/occupancy-headline.interface.js';

// Statuses that occupy a chair (reserved or served): everything except cancelled/no-show. Drives
// the occupancy sparkline's booked minutes per bucket.
const HELD_STATUSES: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CONFIRMED,
  BookingStatus.PENDING,
];
// "Visits held" denominator: due visits (start time passed) with an active outcome.
const DUE_DENOMINATOR: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CONFIRMED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
];
const HELD_NUMERATOR: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CONFIRMED,
];

const EMPTY_OCCUPANCY: OccupancyData = {
  booked: { pastHeldMinutes: 0, futureConfirmedMinutes: 0 },
  capacityMinutes: 0,
  bookedByBucket: [],
};

@Injectable()
export class BookingsAnalyticsService {
  constructor(
    private readonly rangeService: DashboardRangeService,
    private readonly aggregates: BookingsAggregatesService,
    private readonly staffService: StaffService,
    private readonly metricFactory: DashboardMetricFactory,
    private readonly seriesFactory: DashboardSeriesFactory,
    private readonly buckets: DashboardBucketService,
  ) {}

  async getWidgets(
    locationId: string,
    dto: BookingsAnalyticsRequestDto,
  ): Promise<WidgetDto[]> {
    const ctx = await this.buildContext(locationId, dto);
    return dto.keys.map((key) => this.buildWidget(key, ctx));
  }

  private buildWidget(
    key: BookingsAnalyticsWidgetKey,
    ctx: BookingsAnalyticsContext,
  ): WidgetDto {
    switch (key) {
      case BookingsAnalyticsWidgetKey.OCCUPANCY:
        return this.occupancyWidget(key, ctx);
      case BookingsAnalyticsWidgetKey.VISITS_HELD:
        return this.visitsHeldWidget(key, ctx);
      case BookingsAnalyticsWidgetKey.LOST_REVENUE:
        return this.lostRevenueWidget(key, ctx);
      case BookingsAnalyticsWidgetKey.PENDING_CONFIRMATION:
        return this.pendingConfirmationWidget(key, ctx);
      default: {
        const _exhaustive: never = key;
        throw new Error(
          `Unhandled bookings-analytics widget key: ${_exhaustive}`,
        );
      }
    }
  }

  // ── widgets ──────────────────────────────────────────────────────────────

  private occupancyWidget(
    key: BookingsAnalyticsWidgetKey,
    ctx: BookingsAnalyticsContext,
  ): WidgetDto {
    const occupancy = ctx.occupancy ?? EMPTY_OCCUPANCY;
    const bookedMinutes =
      occupancy.booked.pastHeldMinutes +
      occupancy.booked.futureConfirmedMinutes;
    const bookedHours = minutesToHours(bookedMinutes);
    const capacityHours = minutesToHours(occupancy.capacityMinutes);

    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value: occupancyPercent(occupancy),
        previousValue: ctx.previousOccupancy
          ? occupancyPercent(ctx.previousOccupancy)
          : undefined,
        unit: MetricUnit.PERCENT,
        higherIsBetter: true,
        // Spark is the current period only; the previous window has no bucket series.
        spark: this.bookedHoursSpark(ctx.range, occupancy.bookedByBucket),
      }),
      // "booked" and "capacity" in hours so the card can render "18 of 30 hours".
      breakdown: {
        dimension: 'hours',
        items: [
          { id: 'booked', label: 'Booked', value: bookedHours },
          { id: 'capacity', label: 'Capacity', value: capacityHours },
        ],
        total: capacityHours,
      },
      meta: this.buildMeta(ctx, false),
    };
  }

  private visitsHeldWidget(
    key: BookingsAnalyticsWidgetKey,
    ctx: BookingsAnalyticsContext,
  ): WidgetDto {
    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value: visitsHeldPercent(ctx.pastSnapshot),
        previousValue: ctx.previousVisitsHeld,
        unit: MetricUnit.PERCENT,
        higherIsBetter: true,
      }),
      meta: this.buildMeta(ctx, false),
    };
  }

  private lostRevenueWidget(
    key: BookingsAnalyticsWidgetKey,
    ctx: BookingsAnalyticsContext,
  ): WidgetDto {
    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value: money(ctx.lostRevenue ?? MoneyService.decimal(0)),
        previousValue:
          ctx.previousLostRevenue !== undefined
            ? money(ctx.previousLostRevenue)
            : undefined,
        unit: MetricUnit.CURRENCY,
        higherIsBetter: false,
      }),
      meta: this.buildMeta(ctx, true),
    };
  }

  private pendingConfirmationWidget(
    key: BookingsAnalyticsWidgetKey,
    ctx: BookingsAnalyticsContext,
  ): WidgetDto {
    return {
      key,
      kind: WidgetKind.METRIC,
      metric: this.metricFactory.build({
        value: ctx.pendingCount ?? 0,
        unit: MetricUnit.COUNT,
        higherIsBetter: false,
      }),
      meta: this.buildMeta(ctx, false),
    };
  }

  // ── data plumbing ────────────────────────────────────────────────────────

  private async buildContext(
    locationId: string,
    dto: BookingsAnalyticsRequestDto,
  ): Promise<BookingsAnalyticsContext> {
    const range = await this.rangeService.resolve(locationId, dto);
    const now = new Date();
    const compare = range.compareWithPrevious;
    const fullRange = this.rangeFor(locationId, dto, range.from, range.to);
    const previousFullRange = this.rangeFor(
      locationId,
      dto,
      range.previousFrom,
      range.previousTo,
    );

    const needs = (key: BookingsAnalyticsWidgetKey) => dto.keys.includes(key);
    const needsVisitsHeld = needs(BookingsAnalyticsWidgetKey.VISITS_HELD);
    const needsLostRevenue = needs(BookingsAnalyticsWidgetKey.LOST_REVENUE);
    const needsOccupancy = needs(BookingsAnalyticsWidgetKey.OCCUPANCY);

    // "Visits held" only counts visits whose start time has passed, so cap the upper bound at now.
    const pastTo = range.to < now ? range.to : now;
    const pastRange = this.rangeFor(locationId, dto, range.from, pastTo);
    const needsPastSnapshot = needsVisitsHeld && pastTo > range.from;

    const previousPastTo = range.previousTo < now ? range.previousTo : now;
    const previousPastRange = this.rangeFor(
      locationId,
      dto,
      range.previousFrom,
      previousPastTo,
    );
    const needsPreviousPastSnapshot =
      compare && needsVisitsHeld && previousPastTo > range.previousFrom;

    const [
      pastSnapshot,
      previousPastSnapshot,
      lostRevenue,
      previousLostRevenue,
      pendingSnapshot,
      occupancy,
      previousOccupancy,
    ] = await Promise.all([
      needsPastSnapshot ? this.aggregates.snapshot(pastRange) : undefined,
      needsPreviousPastSnapshot
        ? this.aggregates.snapshot(previousPastRange)
        : undefined,
      needsLostRevenue ? this.aggregates.lostRevenue(fullRange) : undefined,
      compare && needsLostRevenue
        ? this.aggregates.lostRevenue(previousFullRange)
        : undefined,
      needs(BookingsAnalyticsWidgetKey.PENDING_CONFIRMATION)
        ? this.aggregates.snapshot(fullRange)
        : undefined,
      needsOccupancy
        ? this.loadOccupancy(locationId, dto, range, now)
        : undefined,
      compare && needsOccupancy
        ? this.loadPreviousOccupancy(locationId, dto, range, now)
        : undefined,
    ]);

    return {
      range,
      pastSnapshot,
      // 0 when the previous window has no due visits. Undefined (comparison off) must not be passed.
      previousVisitsHeld:
        compare && needsVisitsHeld
          ? visitsHeldPercent(previousPastSnapshot)
          : undefined,
      lostRevenue,
      previousLostRevenue,
      pendingCount: pendingSnapshot
        ? countFor(pendingSnapshot, [BookingStatus.PENDING])
        : undefined,
      occupancy,
      previousOccupancy,
    };
  }

  /**
   * Booked minutes, per-bucket booked minutes, and shift capacity for the occupancy card.
   * Occupancy is a staff/room concept, so it honours a `staffId` filter. Shift capacity cannot be
   * scoped per service.
   */
  private async loadOccupancy(
    locationId: string,
    dto: BookingsAnalyticsRequestDto,
    range: ResolvedRange,
    now: Date,
  ): Promise<OccupancyData> {
    const occupancyRange = this.occupancyRange(locationId, dto, range);
    const [booked, bookedByBucket, capacityMinutes] = await Promise.all([
      this.aggregates.occupancyBookedMinutes(occupancyRange, now),
      this.aggregates.series(
        {
          ...occupancyRange,
          granularity: range.granularity,
          timezone: range.timezone,
          statuses: HELD_STATUSES,
        },
        false,
      ),
      this.shiftCapacityMinutes(locationId, dto.staffId, range),
    ]);

    return { booked, bookedByBucket, capacityMinutes };
  }

  /**
   * Same occupancy percent as the current window, over [previousFrom, previousTo). No bucket series:
   * the spark stays on the current period.
   */
  private async loadPreviousOccupancy(
    locationId: string,
    dto: BookingsAnalyticsRequestDto,
    range: ResolvedRange,
    now: Date,
  ): Promise<OccupancyHeadline> {
    const window: ResolvedRange = {
      ...range,
      from: range.previousFrom,
      to: range.previousTo,
    };
    const occupancyRange = this.occupancyRange(locationId, dto, window);
    const [booked, capacityMinutes] = await Promise.all([
      this.aggregates.occupancyBookedMinutes(occupancyRange, now),
      this.shiftCapacityMinutes(locationId, dto.staffId, window),
    ]);
    return { booked, capacityMinutes };
  }

  private occupancyRange(
    locationId: string,
    dto: BookingsAnalyticsRequestDto,
    range: ResolvedRange,
  ): AggregateRange {
    const occupancyRange: AggregateRange = {
      locationId,
      from: range.from,
      to: range.to,
    };
    if (dto.staffId) occupancyRange.staffId = dto.staffId;
    return occupancyRange;
  }

  /**
   * Total shift minutes over the period's calendar days. Shift capacity is owned by StaffService, so
   * we ask it for the shifts rather than touching the staffShift table. Calendar blocks (time off,
   * breaks) are intentionally not subtracted (see the widget key doc).
   */
  private async shiftCapacityMinutes(
    locationId: string,
    staffId: string | undefined,
    range: ResolvedRange,
  ): Promise<number> {
    // range.from/to are business-timezone day boundaries as UTC instants; shift dates are stored at
    // UTC midnight keyed to the business-local calendar day. Resolve the local day strings so the
    // window matches shift storage regardless of the business timezone.
    const fromStr = TimeService.zonedDateStr(range.from, range.timezone);
    // range.to is exclusive (start of the day after the last day), so step back one local day.
    const toStr = TimeService.addDaysStr(
      TimeService.zonedDateStr(range.to, range.timezone),
      -1,
    );
    const shifts = await this.staffService.listShiftsInRange(
      locationId,
      new Date(fromStr),
      new Date(toStr),
    );
    const scoped = staffId
      ? shifts.filter((s) => s.staffId === staffId)
      : shifts;
    return scoped.reduce((sum, shift) => sum + shiftMinutes(shift), 0);
  }

  private bookedHoursSpark(
    range: ResolvedRange,
    bookedByBucket: SeriesRow[],
  ): number[] {
    // serviceDuration per bucket, converted to hours. Uses the same bucket set the factory uses so
    // the array lines up positionally with the card's period.
    const byBucket = new Map<number, number>();
    for (const r of bookedByBucket)
      byBucket.set(r.bucket.getTime(), r.duration);
    return this.buckets
      .bucketStarts(range)
      .map((b) => minutesToHours(byBucket.get(b.getTime()) ?? 0));
  }

  private rangeFor(
    locationId: string,
    dto: BookingsAnalyticsRequestDto,
    from: Date,
    to: Date,
  ): AggregateRange {
    const range: AggregateRange = { locationId, from, to };
    if (dto.staffId) range.staffId = dto.staffId;
    return range;
  }

  private buildMeta(
    ctx: BookingsAnalyticsContext,
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

function countFor(snap: AggregateSnapshot, statuses: BookingStatus[]): number {
  let sum = 0;
  for (const s of statuses) sum += snap.byStatus.get(s)?.count ?? 0;
  return sum;
}

function occupancyPercent(data: OccupancyHeadline): number {
  const bookedMinutes =
    data.booked.pastHeldMinutes + data.booked.futureConfirmedMinutes;
  return data.capacityMinutes > 0
    ? (bookedMinutes / data.capacityMinutes) * 100
    : 0;
}

function visitsHeldPercent(snap: AggregateSnapshot | undefined): number {
  const held = snap ? countFor(snap, HELD_NUMERATOR) : 0;
  const due = snap ? countFor(snap, DUE_DENOMINATOR) : 0;
  return due > 0 ? (held / due) * 100 : 0;
}

function shiftMinutes(shift: StaffShift): number {
  return (
    TimeService.timeToMinutes(shift.endTime) -
    TimeService.timeToMinutes(shift.startTime)
  );
}

function money(value: Prisma.Decimal): number {
  return Number(MoneyService.format(value));
}

function minutesToHours(minutes: number): number {
  return +(minutes / 60).toFixed(1);
}
