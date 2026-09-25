import { Injectable } from '@nestjs/common';
import { TimeService } from '../../time/time.service.js';
import { SeriesGranularity } from '../enums/series-granularity.enum.js';
import { WidgetPeriodDto } from '../dto/widget-period.dto.js';
import { ResolvedRange } from '../interfaces/resolved-range.interface.js';

@Injectable()
export class DashboardBucketService {
  periodDto(range: ResolvedRange): WidgetPeriodDto {
    return { from: range.from.toISOString(), to: range.to.toISOString() };
  }

  previousPeriodDto(range: ResolvedRange): WidgetPeriodDto {
    return { from: range.previousFrom.toISOString(), to: range.previousTo.toISOString() };
  }

  /**
   * Enumerates every bucket start (UTC) between [from, to) aligned to business timezone.
   * Day/week/month boundaries match local wall-clock in the given TZ so the frontend
   * sees "one bucket per calendar day/week/month" regardless of DST shifts.
   */
  bucketStarts(range: ResolvedRange): Date[] {
    return this.bucketStartsForBounds(range.from, range.to, range.granularity, range.timezone);
  }

  bucketStartsForBounds(from: Date, to: Date, granularity: SeriesGranularity, timezone: string): Date[] {
    const buckets: Date[] = [];
    let cursor = this.truncate(from, granularity, timezone);
    while (cursor < to) {
      buckets.push(cursor);
      cursor = this.advance(cursor, granularity, timezone);
    }
    return buckets;
  }

  private truncate(date: Date, granularity: SeriesGranularity, timezone: string): Date {
    const p = TimeService.toZonedParts(date, timezone);
    switch (granularity) {
      case SeriesGranularity.HOUR:
        return TimeService.zonedHourStart(p.year, p.month, p.day, p.hour, timezone);
      case SeriesGranularity.DAY:
        return TimeService.zonedDayStart(p.year, p.month, p.day, timezone);
      case SeriesGranularity.WEEK: {
        // ISO week starts on Monday.
        const dow = TimeService.isoWeekday(p.year, p.month, p.day);
        return TimeService.zonedDayStart(p.year, p.month, p.day - (dow - 1), timezone);
      }
      case SeriesGranularity.MONTH:
        return TimeService.zonedDayStart(p.year, p.month, 1, timezone);
    }
  }

  private advance(date: Date, granularity: SeriesGranularity, timezone: string): Date {
    switch (granularity) {
      case SeriesGranularity.HOUR:
        // Fixed +1h in UTC then re-truncate in TZ; on DST days this naturally produces
        // 23 or 25 wall-clock buckets, which is the correct calendar behaviour.
        return this.truncate(new Date(date.getTime() + 3_600_000), granularity, timezone);
      case SeriesGranularity.DAY:
        return TimeService.addDaysInTz(date, 1, timezone);
      case SeriesGranularity.WEEK:
        return TimeService.addDaysInTz(date, 7, timezone);
      case SeriesGranularity.MONTH: {
        const p = TimeService.toZonedParts(date, timezone);
        return TimeService.zonedDayStart(p.year, p.month + 1, 1, timezone);
      }
    }
  }
}
