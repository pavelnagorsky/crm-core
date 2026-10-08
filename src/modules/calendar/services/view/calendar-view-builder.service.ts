import { Injectable } from '@nestjs/common';
import { CalendarEventRepeatType } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { TimeService } from '../../../../shared/time/time.service.js';
import { LocationService } from '../../../location/location.service.js';
import { StaffService } from '../../../staff/staff.service.js';
import { CalendarEventItemDto } from '../../dto/calendar-event-item.dto.js';
import { GetCalendarRequestDto } from '../../dto/get-calendar-request.dto.js';
import { GetCalendarResponseDto } from '../../dto/get-calendar-response.dto.js';
import { CalendarBookingFeed } from '../../interfaces/calendar-booking-feed.interface.js';
import { CalendarComputeService } from '../calendar-compute.service.js';

@Injectable()
export class CalendarViewBuilderService {
  constructor(
    private readonly db: DatabaseService,
    private readonly staff: StaffService,
    private readonly locationService: LocationService,
    private readonly compute: CalendarComputeService,
  ) {}

  async getCalendar(
    locationId: string,
    dto: GetCalendarRequestDto,
    feed: CalendarBookingFeed,
  ): Promise<GetCalendarResponseDto> {
    const { timezone, currency } =
      await this.locationService.getLocale(locationId);

    const rangeStart = TimeService.dateOnly(dto.from);
    const rangeEnd = TimeService.dateOnly(dto.to);
    const windowStart = TimeService.localToUtc(
      `${dto.from}T00:00:00`,
      timezone,
    );
    const windowEnd = TimeService.localToUtc(
      `${TimeService.addDaysStr(dto.to, 1)}T00:00:00`,
      timezone,
    );
    const dates = TimeService.enumerateDates(dto.from, dto.to);
    const queryStart = new Date(rangeStart.getTime() - 86_400_000);
    const queryEnd = new Date(rangeEnd.getTime() + 2 * 86_400_000 - 1);

    const [shifts, events] = await Promise.all([
      this.staff.listShiftsInRange(
        locationId,
        rangeStart,
        rangeEnd,
        dto.staffIds,
      ),
      this.db.calendarEvent.findMany({
        where: {
          locationId,
          AND: [
            ...(dto.staffIds?.length
              ? [{ OR: [{ staffId: null }, { staffId: { in: dto.staffIds } }] }]
              : []),
            {
              OR: [
                {
                  repeatType: CalendarEventRepeatType.NONE,
                  startDateTime: { lte: queryEnd },
                  endDateTime: { gte: queryStart },
                },
                {
                  repeatType: { not: CalendarEventRepeatType.NONE },
                  startDateTime: { lte: queryEnd },
                  OR: [
                    { repeatUntil: null },
                    { repeatUntil: { gte: rangeStart } },
                  ],
                },
              ],
            },
          ],
        },
        include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
      }),
    ]);

    const linkedEventIds = new Set(feed.linkedEventIds);
    const blocks = events.filter((event) => !linkedEventIds.has(event.id));
    const staffIds = [
      ...new Set(
        blocks.flatMap((event) => (event.staffId ? [event.staffId] : [])),
      ),
    ];
    const staffNames = staffIds.length
      ? await this.staff.namesByIds(staffIds)
      : new Map<string, string>();
    const shiftsByDate = this.compute.groupShiftsByDate(shifts);
    const { minTime, maxTime, closedTime } =
      this.compute.computeViewAndClosedTime(dates, shiftsByDate);
    return {
      range: { from: dto.from, to: dto.to },
      timezone,
      view: { minTime, maxTime },
      closedTime,
      events: [
        ...this.compute.expandEvents(
          blocks,
          dates,
          timezone,
          windowStart,
          windowEnd,
          staffNames,
        ),
        ...feed.bookings.map((booking) =>
          CalendarEventItemDto.booking(booking, timezone, currency),
        ),
      ],
    };
  }
}
