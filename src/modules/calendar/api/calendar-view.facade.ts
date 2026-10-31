import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { resolveItemStaffAssignments } from '../../../shared/scheduling/resolve-item-staff-assignments.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { normalizeStaffAssignments } from '../../../shared/scheduling/normalize-staff-assignments.js';
import { BookingCalendarReadService } from '../../bookings/services/read/booking-calendar-read.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { CalendarFacade } from '../calendar.facade.js';
import { AvailableSlotsDayDto } from '../dto/available-slots-day.dto.js';
import { GetCalendarRequestDto } from '../dto/get-calendar-request.dto.js';
import { GetCalendarResponseDto } from '../dto/get-calendar-response.dto.js';
import { ManualAvailableSlotsRequestDto } from '../dto/manual-available-slots-request.dto.js';

@Injectable()
export class CalendarViewFacade {
  constructor(
    private readonly calendar: CalendarFacade,
    private readonly bookings: BookingCalendarReadService,
    private readonly locationService: LocationService,
  ) {}

  async getCalendar(
    locationId: string,
    dto: GetCalendarRequestDto,
  ): Promise<GetCalendarResponseDto> {
    const { timezone } = await this.locationService.getLocale(locationId);
    const windowStart = TimeUtils.localToUtc(`${dto.from}T00:00:00`, timezone);
    const windowEnd = TimeUtils.localToUtc(
      `${TimeUtils.addDaysStr(dto.to, 1)}T00:00:00`,
      timezone,
    );
    const feed = await this.bookings.listForCalendar(
      locationId,
      windowStart,
      windowEnd,
      dto.staffIds,
    );
    return this.calendar.getCalendar(locationId, dto, feed);
  }

  async getManualAvailableSlots(
    locationId: string,
    dto: ManualAvailableSlotsRequestDto,
    participantStaffId?: string,
  ): Promise<AvailableSlotsDayDto[]> {
    if (dto.itemStaffAssignments?.length && !dto.bookingId) {
      throw new AppException(
        ErrorCode.BOOKING_STAFF_ASSIGNMENT_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.itemStaffAssignments?.length && dto.staffAssignments?.length) {
      throw new AppException(
        ErrorCode.BOOKING_STAFF_ASSIGNMENT_CONFLICT,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.bookingId) {
      const booking = await this.bookings.resolveForReschedule(
        locationId,
        dto.bookingId,
        participantStaffId,
      );
      const requested = normalizeStaffAssignments(
        booking.items.map((item) => item.serviceId),
        booking.executionMode,
        dto.staffId,
        dto.staffAssignments,
      );
      const itemAssignments = resolveItemStaffAssignments(
        booking.items.map((item) => item.id),
        booking.executionMode,
        dto.staffId,
        dto.itemStaffAssignments,
      );
      return this.calendar.getManualRescheduleSlots(
        locationId,
        booking.items.map((item) => ({
          ...item,
          staffId:
            itemAssignments.get(item.id) ??
            requested.get(item.serviceId) ??
            item.staffId,
        })),
        dto.from,
        dto.to,
      );
    }
    return this.calendar.getManualAvailableSlots(locationId, dto);
  }
}
