import { Injectable, NotFoundException } from '@nestjs/common';
import { CalendarEvent, CalendarEventRepeatType, Prisma } from '@prisma/client';
import { eachDayOfInterval, format } from 'date-fns';
import { DatabaseService } from '../../database/database.service.js';
import { TimeService } from '../time/time.service.js';
import { StaffService } from '../staff/staff.service.js';
import { CalendarComputeService } from './calendar-compute.service.js';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';
import { DeleteCalendarEventDto } from './dto/delete-calendar-event.dto.js';
import { GetCalendarRequestDto } from './dto/get-calendar-request.dto.js';
import { GetCalendarResponseDto } from './dto/get-calendar-response.dto.js';
import { CalendarEventWithCancellations } from './interfaces/calendar-types.interface.js';
import { AvailableSlotsRequestDto } from './dto/available-slots-request.dto.js';
import { AvailableSlotsDayDto } from './dto/available-slots-day.dto.js';

@Injectable()
export class CalendarService {
  constructor(
    private readonly db: DatabaseService,
    private readonly time: TimeService,
    private readonly staff: StaffService,
    private readonly compute: CalendarComputeService,
  ) {}

  async create(
    businessId: string,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEvent[]> {
    const staffIds = dto.staffIds?.length ? dto.staffIds : [null];
    return this.db.$transaction(
      staffIds.map((staffId) =>
        this.db.calendarEvent.create({
          data: this.buildEventData(businessId, dto, staffId),
        }),
      ),
    );
  }

  async update(
    eventId: string,
    dto: UpdateCalendarEventDto,
  ): Promise<CalendarEvent> {
    const event = await this.findById(eventId);
    if (!dto.thisOnly) {
      return this.db.calendarEvent.update({
        where: { id: eventId },
        data: this.buildEventData(
          event.businessId,
          dto,
          dto.staffId !== undefined ? dto.staffId : event.staffId,
        ),
      });
    }
    return this.db.$transaction(async (tx) => {
      const occurrenceDate = new Date(dto.occurrenceDate!);
      await tx.calendarEventCancelledOccurrence.upsert({
        where: { eventId_occurrenceDate: { eventId, occurrenceDate } },
        create: { eventId, occurrenceDate },
        update: {},
      });
      return tx.calendarEvent.create({
        data: this.buildEventData(
          event.businessId,
          dto,
          dto.staffId !== undefined ? dto.staffId : event.staffId,
        ),
      });
    });
  }

  async delete(eventId: string, dto: DeleteCalendarEventDto): Promise<void> {
    await this.findById(eventId);
    if (dto.thisOnly) {
      const occurrenceDate = new Date(dto.occurrenceDate!);
      await this.db.calendarEventCancelledOccurrence.upsert({
        where: { eventId_occurrenceDate: { eventId, occurrenceDate } },
        create: { eventId, occurrenceDate },
        update: {},
      });
      return;
    }
    await this.db.calendarEvent.delete({ where: { id: eventId } });
  }

  async findById(eventId: string): Promise<CalendarEvent> {
    const event = await this.db.calendarEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    return event;
  }

  async getCalendar(
    businessId: string,
    dto: GetCalendarRequestDto,
  ): Promise<GetCalendarResponseDto> {
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    const rangeStart = new Date(dto.from);
    const rangeEnd = new Date(dto.to);
    const dates = eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map(
      (d) => format(d, 'yyyy-MM-dd'),
    );

    const [shifts, events] = await Promise.all([
      this.db.staffShift.findMany({
        where: {
          staff: { businessId },
          date: { gte: rangeStart, lte: rangeEnd },
          ...(dto.staffIds?.length ? { staffId: { in: dto.staffIds } } : {}),
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.db.calendarEvent.findMany({
        where: {
          businessId,
          ...(dto.staffIds?.length
            ? { OR: [{ staffId: null }, { staffId: { in: dto.staffIds } }] }
            : {}),
        },
        include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
      }),
    ]);

    const shiftsByDate = this.compute.groupShiftsByDate(shifts);
    const { minTime, maxTime, closedTime } =
      this.compute.computeViewAndClosedTime(dates, shiftsByDate);
    return {
      range: { from: dto.from, to: dto.to },
      timezone: business.timezone,
      view: { minTime, maxTime },
      closedTime,
      events: this.compute.expandEvents(events, dates, business.timezone),
    };
  }

  async getAvailableSlots(
    businessId: string,
    dto: AvailableSlotsRequestDto,
  ): Promise<AvailableSlotsDayDto[]> {
    const [business, service, candidateStaff] = await Promise.all([
      this.db.business.findUnique({
        where: { id: businessId },
        select: {
          timezone: true,
          advanceBookingWindowDays: true,
          slotIntervalMinutes: true,
          minimumBookingNoticeMinutes: true,
        },
      }),
      this.db.service.findFirst({
        where: { id: dto.serviceId, businessId, isActive: true },
        select: { durationMinutes: true, bufferMinutes: true },
      }),
      this.staff.resolveStaffForService(businessId, dto.serviceId, dto.staffId),
    ]);

    if (!business) throw new NotFoundException('Business not found');
    if (!service) throw new NotFoundException('Service not found');
    if (candidateStaff.length === 0) return [];

    const { todayStr, nowMinutes, rangeStart, rangeEnd } =
      this.resolveBookingWindow(business);
    const staffIds = candidateStaff.map((s) => s.id);
    const [shifts, blockEvents] = await this.fetchSlotData(
      businessId,
      staffIds,
      rangeStart,
      rangeEnd,
    );

    const dates = [
      ...new Set(shifts.map((s) => format(s.date, 'yyyy-MM-dd'))),
    ].sort();
    const shiftsByStaffDate = this.compute.groupShiftsByStaffDate(shifts);
    const blockedByStaffDate = this.compute.expandBlockEvents(
      blockEvents,
      dates,
      staffIds,
      business.timezone,
    );
    const slotDuration = service.durationMinutes + service.bufferMinutes;

    return dates.flatMap((date) => {
      const earliestMinute =
        date === todayStr
          ? nowMinutes + business.minimumBookingNoticeMinutes
          : 0;
      const slots = this.compute.collectSlotsForDate(
        date,
        candidateStaff,
        shiftsByStaffDate,
        blockedByStaffDate,
        earliestMinute,
        slotDuration,
        business.slotIntervalMinutes,
      );
      return slots.length
        ? [
            {
              date,
              slots: slots.map((start) => ({
                time: this.time.minutesToHHmm(start),
              })),
            },
          ]
        : [];
    });
  }

  /**
   * Returns the subset of `candidates` who have a shift covering [startAt, endAt)
   * and no blocking calendar events on that slot.
   */
  async filterAvailableStaff(
    businessId: string,
    candidates: { id: string }[],
    dateStr: string,
    startAt: Date,
    endAt: Date,
    timezone: string,
  ): Promise<{ id: string }[]> {
    const staffIds = candidates.map((c) => c.id);
    const date = new Date(dateStr);

    const [shifts, blockEvents] = await Promise.all([
      this.db.staffShift.findMany({ where: { staffId: { in: staffIds }, date } }),
      this.db.calendarEvent.findMany({
        where: {
          businessId,
          OR: [{ staffId: null }, { staffId: { in: staffIds } }],
          repeatType: CalendarEventRepeatType.NONE,
          startDateTime: { lte: endAt },
          endDateTime: { gte: startAt },
        },
        include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
      }),
    ]);

    const shiftsByStaff = new Map(shifts.map((s) => [s.staffId, s]));
    return candidates.filter((c) =>
      this.isSlotFree(c.id, dateStr, startAt, endAt, shiftsByStaff.get(c.id) ?? null, blockEvents, timezone),
    );
  }

  /**
   * Returns true if the [startAt, endAt) slot fits within the staff shift and has
   * no overlapping block calendar events on that date.
   * Accepts already-fetched data so it can be called inside a $transaction re-check.
   */
  isSlotFree(
    staffId: string,
    dateStr: string,
    startAt: Date,
    endAt: Date,
    shift: { startTime: Date; endTime: Date } | null,
    blockEvents: CalendarEventWithCancellations[],
    timezone: string,
  ): boolean {
    if (!shift) return false;

    const slotStart = this.time.dateToMinutes(startAt, timezone);
    const slotEnd = this.time.dateToMinutes(endAt, timezone);

    if (slotStart < this.time.timeToMinutes(shift.startTime) || slotEnd > this.time.timeToMinutes(shift.endTime)) {
      return false;
    }

    const blocked = this.compute.expandBlockEvents(blockEvents, [dateStr], [staffId], timezone)
      .get(staffId)?.get(dateStr) ?? [];

    return !blocked.some((b) => slotStart < b.end && slotEnd > b.start);
  }

  private resolveBookingWindow(business: {
    timezone: string;
    advanceBookingWindowDays: number;
  }) {
    const nowParts = this.time.toZonedParts(new Date(), business.timezone);
    const todayStr = format(
      new Date(nowParts.year, nowParts.month - 1, nowParts.day),
      'yyyy-MM-dd',
    );
    const rangeStart = new Date(todayStr);
    const rangeEnd = new Date(todayStr);
    rangeEnd.setDate(
      rangeEnd.getDate() + business.advanceBookingWindowDays - 1,
    );
    return {
      todayStr,
      nowMinutes: nowParts.hour * 60 + nowParts.minute,
      rangeStart,
      rangeEnd,
    };
  }

  private fetchSlotData(
    businessId: string,
    staffIds: string[],
    rangeStart: Date,
    rangeEnd: Date,
  ) {
    return Promise.all([
      this.db.staffShift.findMany({
        where: {
          staffId: { in: staffIds },
          date: { gte: rangeStart, lte: rangeEnd },
        },
      }),
      this.db.calendarEvent.findMany({
        where: {
          businessId,
          AND: [
            { OR: [{ staffId: null }, { staffId: { in: staffIds } }] },
            {
              OR: [
                {
                  repeatType: CalendarEventRepeatType.NONE,
                  startDateTime: { lte: rangeEnd },
                  endDateTime: { gte: rangeStart },
                },
                {
                  repeatType: { not: CalendarEventRepeatType.NONE },
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
  }

  private buildEventData(
    businessId: string,
    dto: CreateCalendarEventDto | UpdateCalendarEventDto,
    staffId?: string | null,
  ): Prisma.CalendarEventUncheckedCreateInput {
    return {
      businessId,
      staffId: staffId ?? null,
      type: dto.type,
      reason: dto.reason ?? null,
      title: dto.title ?? null,
      notes: dto.notes ?? null,
      repeatType: dto.repeatType,
      startDateTime: new Date(dto.startDateTime),
      endDateTime: new Date(dto.endDateTime),
      daysMask: dto.daysMask ?? null,
      repeatUntil: dto.repeatUntil ? new Date(dto.repeatUntil) : null,
    };
  }
}
