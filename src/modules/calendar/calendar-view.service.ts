import { Injectable } from '@nestjs/common';
import { TimeService } from '../../shared/time/time.service.js';
import { LocationService } from '../location/location.service.js';
import { CalendarBookingReader } from './calendar-booking-reader.js';
import { CalendarService } from './calendar.service.js';
import { AvailableSlotsDayDto } from './dto/available-slots-day.dto.js';
import { GetCalendarRequestDto } from './dto/get-calendar-request.dto.js';
import { GetCalendarResponseDto } from './dto/get-calendar-response.dto.js';
import { ManualAvailableSlotsRequestDto } from './dto/manual-available-slots-request.dto.js';

@Injectable()
export class CalendarViewService {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly bookings: CalendarBookingReader,
    private readonly locationService: LocationService,
  ) {}

  async getCalendar(
    locationId: string,
    dto: GetCalendarRequestDto,
  ): Promise<GetCalendarResponseDto> {
    const { timezone } = await this.locationService.getLocale(locationId);
    const windowStart = TimeService.localToUtc(
      `${dto.from}T00:00:00`,
      timezone,
    );
    const windowEnd = TimeService.localToUtc(
      `${TimeService.addDaysStr(dto.to, 1)}T00:00:00`,
      timezone,
    );
    const feed = await this.bookings.listForCalendar(
      locationId,
      windowStart,
      windowEnd,
      dto.staffIds,
    );
    return this.calendarService.getCalendar(locationId, dto, feed);
  }

  async getManualAvailableSlots(
    locationId: string,
    dto: ManualAvailableSlotsRequestDto,
  ): Promise<AvailableSlotsDayDto[]> {
    const excludedCalendarEventIds = dto.bookingId
      ? await this.bookings.linkedCalendarEventIdsForBooking(
          locationId,
          dto.bookingId,
        )
      : [];
    return this.calendarService.getManualAvailableSlots(
      locationId,
      dto,
      excludedCalendarEventIds,
    );
  }
}
