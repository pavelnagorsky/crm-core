import { Injectable } from '@nestjs/common';
import { TimeUtils } from '../../../shared/time/time.utils.js';
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
    const excludedCalendarEventIds = dto.bookingId
      ? await this.bookings.linkedCalendarEventIdsForBooking(
          locationId,
          dto.bookingId,
          participantStaffId,
        )
      : [];
    return this.calendar.getManualAvailableSlots(
      locationId,
      dto,
      excludedCalendarEventIds,
    );
  }
}
