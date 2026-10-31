import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingExecutionMode as PrismaBookingExecutionMode } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { assignStaff } from '../../../shared/scheduling/assign-staff.js';
import { normalizeStaffAssignments } from '../../../shared/scheduling/normalize-staff-assignments.js';
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
      customEndAt,
    } = request;
    const requested = normalizeStaffAssignments(
      services.map((service) => service.id),
      executionMode,
      requestedStaffId,
      request.staffAssignments,
      manualItems,
    );
    const cursor = new Date(startAt);
    const intervals = services.map((_, index) => {
      const interval = this.itemInterval(
        services,
        index,
        startAt,
        cursor,
        executionMode,
        customEndAt,
      );
      if (executionMode === PrismaBookingExecutionMode.SEQUENTIAL)
        cursor.setTime(interval.endAt.getTime());
      return interval;
    });
    const candidates = await Promise.all(
      services.map(async (service, index) => {
        const requestedId =
          manualItems[index]?.staffId ?? requested.get(service.id);
        const qualified = await this.staffService.resolveStaffForService(
          locationId,
          service.id,
          requestedId,
        );
        if (requestedId && qualified.length === 0) {
          throw new AppException(
            ErrorCode.BOOKING_STAFF_NOT_FOUND,
            HttpStatus.NOT_FOUND,
          );
        }
        const interval = intervals[index];
        return this.calendar.filterAvailableStaff(
          locationId,
          qualified,
          TimeUtils.zonedDateStr(interval.startAt, timezone),
          interval.startAt,
          interval.endAt,
          timezone,
        );
      }),
    );
    const staffIds = [
      ...new Set(candidates.flatMap((group) => group.map((staff) => staff.id))),
    ];
    const dayStart = TimeUtils.localToUtc(
      `${TimeUtils.zonedDateStr(startAt, timezone)}T00:00:00`,
      timezone,
    );
    const counts = staffIds.length
      ? await this.db.bookingItem.groupBy({
          by: ['staffId'],
          where: {
            location: ACTIVE_LOCATION_WHERE,
            locationId,
            staffId: { in: staffIds },
            startAt: {
              gte: dayStart,
              lt: TimeUtils.addDaysInTz(dayStart, 1, timezone),
            },
          },
          _count: { id: true },
        })
      : [];
    const countByStaff = new Map(
      counts.map((row) => [row.staffId, row._count.id]),
    );
    const team = assignStaff(
      candidates.map((group, index) => ({
        itemId: String(index),
        staffIds: group
          .map((staff) => staff.id)
          .sort(
            (a, b) =>
              (countByStaff.get(a) ?? 0) - (countByStaff.get(b) ?? 0) ||
              a.localeCompare(b),
          ),
      })),
      executionMode === PrismaBookingExecutionMode.PARALLEL,
    );
    if (!team)
      throw new AppException(
        ErrorCode.BOOKING_NO_STAFF_AVAILABLE,
        HttpStatus.CONFLICT,
      );
    const staffNames = new Map(
      await Promise.all(
        [...new Set(team.values())].map(async (id) => {
          const staff = await this.staffService.findById(id);
          return [id, staff.name] as const;
        }),
      ),
    );

    return services.map((service, index) => {
      const staffId = team.get(String(index))!;
      return {
        serviceId: service.id,
        staffId,
        sortOrder: index,
        startAt: intervals[index].startAt,
        endAt: intervals[index].endAt,
        serviceTitle: service.title,
        serviceDuration: service.durationMinutes,
        listPrice: service.price,
        chargedPrice: service.price,
        customPrice: manualItems[index]?.customPrice ?? null,
        staffName: staffNames.get(staffId)!,
      };
    });
  }

  private itemInterval(
    services: BookingServiceSnapshot[],
    index: number,
    startAt: Date,
    cursor: Date,
    executionMode: PrismaBookingExecutionMode,
    customEndAt: Date | null,
  ): { startAt: Date; endAt: Date } {
    const defaultMs =
      (services[index].durationMinutes + services[index].bufferMinutes) *
      60_000;
    if (!customEndAt) {
      const itemStart =
        executionMode === PrismaBookingExecutionMode.PARALLEL
          ? startAt
          : new Date(cursor);
      return {
        startAt: itemStart,
        endAt: new Date(itemStart.getTime() + defaultMs),
      };
    }

    if (customEndAt.getTime() <= startAt.getTime()) {
      throw new AppException(
        ErrorCode.BOOKING_INVALID_INTERVAL,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (executionMode === PrismaBookingExecutionMode.PARALLEL) {
      return { startAt, endAt: customEndAt };
    }

    const totalDefaultMs = services.reduce(
      (sum, service) =>
        sum + (service.durationMinutes + service.bufferMinutes) * 60_000,
      0,
    );
    const totalActualMs = customEndAt.getTime() - startAt.getTime();
    const itemStart = new Date(cursor);
    const itemEnd =
      index === services.length - 1
        ? customEndAt
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
}
