import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { PriceAdjustmentKind } from '../engine/enums/price-adjustment-kind.enum.js';
import { PriceBook } from '../engine/price-book.js';
import { PriceWeekMapRequestDto } from '../dto/price-week-map-request.dto.js';
import { PriceWeekMap } from '../interfaces/price-week-map.interface.js';
import { PriceWeekMapDay } from '../interfaces/price-week-map-day.interface.js';
import { withLevelScope } from '../rules/price-level-scope.rules.js';
import { PricingSnapshotService } from './pricing-snapshot.service.js';

const WEEK_DAYS = 7;
const DEFAULT_HOURS = { from: 9, to: 21 };
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

/**
 * The week map: for each of 7 days the parts of the day where a visit to one service costs
 * the same, for one staff member, one price level or the base level. A level is priced as a
 * staff member of that level without personal prices: a synthetic staff entry is added to
 * the snapshot (withLevelScope), so the engine needs no level scope of its own.
 */
@Injectable()
export class PriceWeekMapService {
  constructor(
    private readonly snapshots: PricingSnapshotService,
    private readonly staff: StaffService,
  ) {}

  async weekMap(
    locationId: string,
    query: PriceWeekMapRequestDto,
  ): Promise<PriceWeekMap> {
    if (query.staffId !== undefined && query.levelId !== undefined)
      throw new BadRequestException('At most one of staffId and levelId');
    const loaded = await this.snapshots.load(
      locationId,
      ReadConsistency.CACHED,
    );
    let snapshot = loaded;
    let staffId: string | null = query.staffId ?? null;
    if (staffId !== null && !loaded.staff.some((item) => item.id === staffId))
      throw new AppException(
        ErrorCode.BOOKING_STAFF_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (query.levelId !== undefined) {
      const scoped = withLevelScope(loaded, query.levelId);
      if (!scoped)
        throw new AppException(
          ErrorCode.PRICE_LEVEL_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      snapshot = scoped.snapshot;
      staffId = scoped.staffId;
    }
    const book = new PriceBook(snapshot);
    if (!book.hasService(query.serviceId))
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );

    const scope = {
      bundleId: null,
      lines: [{ serviceId: query.serviceId, staffId, customPrice: null }],
    };
    const dates = Array.from({ length: WEEK_DAYS }, (_, index) =>
      TimeUtils.addDaysStr(query.weekStart, index),
    );
    const days: PriceWeekMapDay[] = dates.map((date) => ({
      date,
      segments: book.daySegments(scope, date).map((segment) => {
        const [line] = segment.quote.lines;
        return {
          start: segment.startMinute,
          end: segment.endMinute,
          price: line.total,
          staffPrice: line.staffPrice,
          adjustments: line.adjustments
            .filter(
              (adjustment) =>
                adjustment.kind === PriceAdjustmentKind.SURCHARGE ||
                adjustment.kind === PriceAdjustmentKind.ROUNDING,
            )
            .map((adjustment) => ({
              ruleId: adjustment.ruleId,
              title: adjustment.title,
              amount: adjustment.amount,
            })),
        };
      }),
    }));
    return {
      hours: await this.hours(
        locationId,
        query.serviceId,
        dates[0],
        dates[WEEK_DAYS - 1],
      ),
      days,
    };
  }

  /** Whole hours from the earliest shift start to the latest shift end of the service's staff. */
  private async hours(
    locationId: string,
    serviceId: string,
    from: string,
    to: string,
  ): Promise<{ from: number; to: number }> {
    const performers = await this.staff.resolveStaffForService(
      locationId,
      serviceId,
    );
    const shifts = await this.staff.listShiftsForStaff(
      performers.map((member) => member.id),
      TimeUtils.dateOnly(from),
      TimeUtils.dateOnly(to),
    );
    if (shifts.length === 0) return DEFAULT_HOURS;
    const starts = shifts.map((shift) => TimeUtils.timeToMinutes(shift.startTime));
    // A shift that ends at 00:00 ends at the end of its day.
    const ends = shifts.map(
      (shift) => TimeUtils.timeToMinutes(shift.endTime) || MINUTES_PER_DAY,
    );
    return {
      from: Math.floor(Math.min(...starts) / MINUTES_PER_HOUR),
      to: Math.ceil(Math.max(...ends) / MINUTES_PER_HOUR),
    };
  }
}
