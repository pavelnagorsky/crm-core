import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { BookingsAggregatesService } from '../../bookings/aggregates/services/bookings-aggregates.service.js';
import { OrdersAggregatesService } from '../../orders/analytics/services/orders-aggregates.service.js';
import {
  BOOKING_SERIES_KEYS,
  BOOKING_SNAPSHOT_KEYS,
  PREVIOUS_BOOKING_SERIES_KEYS,
  PRODUCT_SERIES_KEYS,
  PRODUCT_SNAPSHOT_KEYS,
  REVENUE_STATUSES,
} from '../constants/dashboard-widget.constants.js';
import { DashboardWidgetsRequestDto } from '../dto/dashboard-widgets-request.dto.js';
import { DashboardWidgetKey } from '../enums/dashboard-widget-key.enum.js';
import { DashboardReadContext } from '../interfaces/dashboard-read-context.interface.js';
import { ResolvedRange } from '../interfaces/resolved-range.interface.js';
import {
  emptyProductSnapshot,
  emptySnapshot,
  wants,
  windowRange,
} from '../rules/dashboard-metrics.js';

@Injectable()
export class DashboardContextService {
  constructor(
    private readonly bookingsAggregates: BookingsAggregatesService,
    private readonly ordersAggregates: OrdersAggregatesService,
  ) {}
  async load(
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
}
