import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingExecutionMode as PrismaBookingExecutionMode } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { BookingScheduleRequest } from '../interfaces/booking-schedule-request.interface.js';
import { BookingServiceSnapshot } from '../interfaces/booking-service-snapshot.interface.js';
import { ResolvedBookingItem } from '../interfaces/resolved-booking-item.interface.js';

@Injectable()
export class BookingSchedulingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly staffService: StaffService,
    private readonly calendar: CalendarFacade,
  ) {}

  async resolveForBooking(
    request: BookingScheduleRequest,
  ): Promise<ResolvedBookingItem[]> {
    const {
      locationId,
      services,
      startAt,
      executionMode,
      requestedStaffId,
      timezone,
      manualItems,
      walkInEndAt,
    } = request;
    const staffNames = new Map<string, string>();
    const result: ResolvedBookingItem[] = [];
    const cursor = new Date(startAt);
    const usedParallelStaff = new Set<string>();

    for (let index = 0; index < services.length; index += 1) {
      const service = services[index];
      const manual = manualItems[index];
      const interval = this.itemInterval(
        services,
        index,
        startAt,
        cursor,
        executionMode,
        walkInEndAt,
      );
      const staffId = await this.resolveItemStaff(
        locationId,
        service.id,
        manual?.staffId ?? requestedStaffId,
        interval.startAt,
        interval.endAt,
        timezone,
        executionMode === PrismaBookingExecutionMode.PARALLEL
          ? usedParallelStaff
          : new Set<string>(),
      );
      usedParallelStaff.add(staffId);
      if (!staffNames.has(staffId)) {
        const staff = await this.staffService.findById(staffId);
        staffNames.set(staffId, staff.name);
      }
      result.push({
        serviceId: service.id,
        staffId,
        sortOrder: index,
        startAt: interval.startAt,
        endAt: interval.endAt,
        serviceTitle: service.title,
        serviceDuration: service.durationMinutes,
        listPrice: service.price,
        chargedPrice: service.price,
        customPrice: manual?.customPrice ?? null,
        staffName: staffNames.get(staffId)!,
      });
      if (executionMode === PrismaBookingExecutionMode.SEQUENTIAL)
        cursor.setTime(interval.endAt.getTime());
    }

    return result;
  }

  private itemInterval(
    services: BookingServiceSnapshot[],
    index: number,
    startAt: Date,
    cursor: Date,
    executionMode: PrismaBookingExecutionMode,
    walkInEndAt: Date | null,
  ): { startAt: Date; endAt: Date } {
    const defaultMs =
      (services[index].durationMinutes + services[index].bufferMinutes) *
      60_000;
    if (!walkInEndAt) {
      const itemStart =
        executionMode === PrismaBookingExecutionMode.PARALLEL
          ? startAt
          : new Date(cursor);
      return {
        startAt: itemStart,
        endAt: new Date(itemStart.getTime() + defaultMs),
      };
    }

    if (walkInEndAt.getTime() <= startAt.getTime()) {
      throw new AppException(
        ErrorCode.BOOKING_INVALID_INTERVAL,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (executionMode === PrismaBookingExecutionMode.PARALLEL) {
      return { startAt, endAt: walkInEndAt };
    }

    const totalDefaultMs = services.reduce(
      (sum, service) =>
        sum + (service.durationMinutes + service.bufferMinutes) * 60_000,
      0,
    );
    const totalActualMs = walkInEndAt.getTime() - startAt.getTime();
    const itemStart = new Date(cursor);
    const itemEnd =
      index === services.length - 1
        ? walkInEndAt
        : new Date(
            itemStart.getTime() +
              Math.round((totalActualMs * defaultMs) / totalDefaultMs),
          );
    if (itemEnd.getTime() <= itemStart.getTime()) {
      throw new AppException(
        ErrorCode.BOOKING_INVALID_INTERVAL,
        HttpStatus.BAD_REQUEST,
      );
    }
    return { startAt: itemStart, endAt: itemEnd };
  }

  private async resolveItemStaff(
    locationId: string,
    serviceId: string,
    requestedStaffId: string | undefined,
    startAt: Date,
    endAt: Date,
    timezone: string,
    excludedStaffIds: Set<string>,
  ): Promise<string> {
    const candidates = await this.staffService.resolveStaffForService(
      locationId,
      serviceId,
      requestedStaffId,
    );
    if (requestedStaffId && candidates.length === 0) {
      throw new AppException(
        ErrorCode.BOOKING_STAFF_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    const filteredCandidates = candidates.filter(
      (candidate) => !excludedStaffIds.has(candidate.id),
    );
    const available = await this.calendar.filterAvailableStaff(
      locationId,
      filteredCandidates,
      TimeUtils.zonedDateStr(startAt, timezone),
      startAt,
      endAt,
      timezone,
    );
    if (available.length === 0)
      throw new AppException(
        ErrorCode.BOOKING_NO_STAFF_AVAILABLE,
        HttpStatus.CONFLICT,
      );
    if (requestedStaffId) return available[0].id;

    const dayStart = TimeUtils.localToUtc(
      `${TimeUtils.zonedDateStr(startAt, timezone)}T00:00:00`,
      timezone,
    );
    const dayEnd = TimeUtils.addDaysInTz(dayStart, 1, timezone);
    const counts = await this.db.bookingItem.groupBy({
      by: ['staffId'],
      where: {
        location: ACTIVE_LOCATION_WHERE,
        staffId: { in: available.map((staff) => staff.id) },
        startAt: { gte: dayStart, lt: dayEnd },
      },
      _count: { id: true },
    });
    const countByStaff = new Map(
      counts.map((row) => [row.staffId, row._count.id]),
    );
    return [...available].sort(
      (a, b) => (countByStaff.get(a.id) ?? 0) - (countByStaff.get(b.id) ?? 0),
    )[0].id;
  }
}
