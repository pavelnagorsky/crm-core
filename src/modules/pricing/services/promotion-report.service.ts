import { Injectable } from '@nestjs/common';
import { BookingsFacade } from '../../bookings/bookings.facade.js';
import { DashboardPeriod } from '../../dashboard/enums/dashboard-period.enum.js';
import { DashboardRangeService } from '../../dashboard/services/dashboard-range.service.js';
import { ResolvedRange } from '../../dashboard/interfaces/resolved-range.interface.js';
import { LocationService } from '../../location/services/location.service.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PromotionReportPeriod } from '../enums/promotion-report-period.enum.js';
import { PromotionFullReport } from '../interfaces/promotion-full-report.interface.js';
import { PromotionPageReport } from '../interfaces/promotion-page-report.interface.js';
import { PromotionReportPeriodDays } from '../interfaces/promotion-report-period.interface.js';
import { PromotionReportPrevious } from '../interfaces/promotion-report-previous.interface.js';
import { PromotionProductStatsService } from './promotion-product-stats.service.js';

const WINDOW_DAYS = {
  [PromotionReportPeriod.DAYS_30]: 30,
  [PromotionReportPeriod.DAYS_90]: 90,
} as const;

/**
 * The promotion page (docs/pricing-stage8-api.md, «Страница акции»): the period as in the
 * analytics of the location (DashboardRangeService, location timezone), the report of the
 * visits and product lines over it and the same figures for the previous period.
 */
@Injectable()
export class PromotionReportService {
  constructor(
    private readonly bookings: BookingsFacade,
    private readonly productStats: PromotionProductStatsService,
    private readonly ranges: DashboardRangeService,
    private readonly locations: LocationService,
  ) {}

  /**
   * 30d: the last 30 days as LAST_30D; 90d: 89 days back to today (a custom range); all: from
   * the day the rule was created to today. The previous period of 30d and 90d is the window of
   * equal length before the period; "all" has none.
   */
  async build(
    locationId: string,
    rule: { id: string; createdAt: Date },
    period: PromotionReportPeriod,
    now: Date = new Date(),
  ): Promise<PromotionPageReport> {
    const { timezone } = await this.locations.getLocale(locationId);
    const range = await this.ranges.resolve(
      locationId,
      this.rangeInput(period, rule.createdAt, now, timezone),
    );
    const report = await this.over(locationId, rule.id, range.from, now);
    const previous =
      period === PromotionReportPeriod.ALL
        ? null
        : await this.previous(locationId, rule.id, range);
    return {
      ...report,
      period: this.days(range),
      previous,
    };
  }

  private rangeInput(
    period: PromotionReportPeriod,
    ruleCreatedAt: Date,
    now: Date,
    timezone: string,
  ): Parameters<DashboardRangeService['resolve']>[1] {
    if (period === PromotionReportPeriod.DAYS_30)
      return { period: DashboardPeriod.LAST_30D, timezone };
    const today = TimeUtils.zonedDateStr(now, timezone);
    const start =
      period === PromotionReportPeriod.DAYS_90
        ? TimeUtils.addDaysStr(today, 1 - WINDOW_DAYS[period])
        : TimeUtils.zonedDateStr(ruleCreatedAt, timezone);
    return {
      period: DashboardPeriod.CUSTOM,
      from: start < today ? start : today,
      to: today,
      timezone,
    };
  }

  /** The visits and the product lines of the window [from, until]. */
  private async over(
    locationId: string,
    ruleId: string,
    from: Date,
    until: Date,
  ): Promise<PromotionFullReport> {
    const visits = await this.bookings.getPromotionReport(
      locationId,
      ruleId,
      from,
      until,
    );
    return this.productStats.fullReport(
      locationId,
      ruleId,
      from,
      until,
      visits,
    );
  }

  private async previous(
    locationId: string,
    ruleId: string,
    range: ResolvedRange,
  ): Promise<PromotionReportPrevious> {
    // The window is [previousFrom, previousTo): the upper bound of the reads is inclusive.
    const until = new Date(range.previousTo.getTime() - 1);
    const report = await this.over(
      locationId,
      ruleId,
      range.previousFrom,
      until,
    );
    return {
      revenue: report.revenue,
      discount: report.discount,
      bookingsCount: report.bookingsCount,
      salesCount: report.salesCount,
      clientsCount: report.clientsCount,
      returnedRate: report.returnedRate,
    };
  }

  private days(range: ResolvedRange): PromotionReportPeriodDays {
    return {
      from: TimeUtils.zonedDateStr(range.from, range.timezone),
      to: TimeUtils.zonedDateStr(
        new Date(range.to.getTime() - 1),
        range.timezone,
      ),
    };
  }
}
