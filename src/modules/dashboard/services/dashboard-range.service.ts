import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BusinessService } from '../../business/business.service.js';
import { TimeService } from '../../time/time.service.js';
import { DashboardRangeDto } from '../dto/dashboard-range.dto.js';
import { DashboardPeriod } from '../enums/dashboard-period.enum.js';
import { SeriesGranularity } from '../enums/series-granularity.enum.js';
import { ResolvedRange } from '../interfaces/resolved-range.interface.js';

@Injectable()
export class DashboardRangeService {
  constructor(private readonly businessService: BusinessService) {}

  async resolve(businessId: string, dto: DashboardRangeDto): Promise<ResolvedRange> {
    const locale = await this.businessService.getLocale(businessId);
    const timezone = dto.timezone && TimeService.isValidIanaTimezone(dto.timezone) ? dto.timezone : locale.timezone;

    const { from, to } = this.resolvePeriodBounds(dto, timezone);
    const granularity = dto.groupBy ?? this.autoGranularity(from, to);
    const { previousFrom, previousTo } = this.previousPeriod(from, to);

    return {
      from,
      to,
      previousFrom,
      previousTo,
      granularity,
      timezone,
      currency: locale.currency,
      compareWithPrevious: dto.compareWithPrevious ?? true,
    };
  }

  private resolvePeriodBounds(dto: DashboardRangeDto, timezone: string): { from: Date; to: Date } {
    if (dto.period === DashboardPeriod.CUSTOM) {
      if (!dto.from || !dto.to) throw new AppException(ErrorCode.DASHBOARD_CUSTOM_RANGE_REQUIRED, HttpStatus.BAD_REQUEST);
      // Both dates are treated as inclusive calendar days in the business timezone.
      // "from" is the start of that day, "to" is the start of the day AFTER the end day
      // so the half-open [from, to) window covers the end day in full.
      const fromParts = TimeService.toZonedParts(new Date(dto.from), timezone);
      const toParts = TimeService.toZonedParts(new Date(dto.to), timezone);
      const from = TimeService.zonedDayStart(fromParts.year, fromParts.month, fromParts.day, timezone);
      const to = TimeService.zonedDayStart(toParts.year, toParts.month, toParts.day + 1, timezone);
      if (from >= to) throw new AppException(ErrorCode.DASHBOARD_CUSTOM_RANGE_INVALID, HttpStatus.BAD_REQUEST);
      return { from, to };
    }

    const today = TimeService.toZonedParts(new Date(), timezone);
    const startOfToday = TimeService.zonedDayStart(today.year, today.month, today.day, timezone);
    const startOfTomorrow = TimeService.addDaysInTz(startOfToday, 1, timezone);

    switch (dto.period) {
      case DashboardPeriod.TODAY:
        return { from: startOfToday, to: startOfTomorrow };
      case DashboardPeriod.YESTERDAY:
        return { from: TimeService.addDaysInTz(startOfToday, -1, timezone), to: startOfToday };
      case DashboardPeriod.LAST_7D:
        return { from: TimeService.addDaysInTz(startOfToday, -6, timezone), to: startOfTomorrow };
      case DashboardPeriod.LAST_30D:
        return { from: TimeService.addDaysInTz(startOfToday, -29, timezone), to: startOfTomorrow };
      case DashboardPeriod.MTD:
        return { from: TimeService.zonedDayStart(today.year, today.month, 1, timezone), to: startOfTomorrow };
      case DashboardPeriod.YTD:
        return { from: TimeService.zonedDayStart(today.year, 1, 1, timezone), to: startOfTomorrow };
      default:
        throw new AppException(ErrorCode.DASHBOARD_CUSTOM_RANGE_INVALID, HttpStatus.BAD_REQUEST);
    }
  }

  // Rolling previous period of equal length. Note: for MTD/YTD this is not a calendar
  // month-over-month or year-over-year comparison — it's the immediately preceding window
  // of the same duration. Documented explicitly because it's a deliberate simplification.
  private previousPeriod(from: Date, to: Date): { previousFrom: Date; previousTo: Date } {
    const durationMs = to.getTime() - from.getTime();
    return { previousFrom: new Date(from.getTime() - durationMs), previousTo: from };
  }

  private autoGranularity(from: Date, to: Date): SeriesGranularity {
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    if (days <= 2) return SeriesGranularity.HOUR;
    if (days <= 45) return SeriesGranularity.DAY;
    if (days <= 365) return SeriesGranularity.WEEK;
    return SeriesGranularity.MONTH;
  }
}
