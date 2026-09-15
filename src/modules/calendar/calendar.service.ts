import { Injectable, NotFoundException } from '@nestjs/common';
import { CalendarEvent, CalendarEventRepeatType } from '@prisma/client';
import { eachDayOfInterval, format } from 'date-fns';
import { DatabaseService } from '../../database/database.service.js';
import { TimeService } from '../time/time.service.js';
import { CalendarComputeService } from './calendar-compute.service.js';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';
import { DeleteCalendarEventDto } from './dto/delete-calendar-event.dto.js';
import { GetCalendarRequestDto } from './dto/get-calendar-request.dto.js';
import { GetCalendarResponseDto } from './dto/get-calendar-response.dto.js';
import { AvailableSlotsRequestDto } from './dto/available-slots-request.dto.js';
import { AvailableSlotsDayDto } from './dto/available-slots-day.dto.js';

@Injectable()
export class CalendarService {
  constructor(
    private readonly db: DatabaseService,
    private readonly time: TimeService,
    private readonly compute: CalendarComputeService,
  ) {}

  async create(businessId: string, dto: CreateCalendarEventDto): Promise<CalendarEvent[]> {
    const staffIds = dto.staffIds?.length ? dto.staffIds : [null];

    return this.db.$transaction(
      staffIds.map((staffId) =>
        this.db.calendarEvent.create({
          data: {
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
          },
        }),
      ),
    );
  }

  async update(eventId: string, dto: UpdateCalendarEventDto): Promise<CalendarEvent> {
    const event = await this.findById(eventId);

    if (dto.thisOnly) {
      const occurrenceDate = new Date(dto.occurrenceDate!);

      return this.db.$transaction(async (tx) => {
        await tx.calendarEventCancelledOccurrence.upsert({
          where: { eventId_occurrenceDate: { eventId, occurrenceDate } },
          create: { eventId, occurrenceDate },
          update: {},
        });

        return tx.calendarEvent.create({
          data: {
            businessId: event.businessId,
            staffId: dto.staffId !== undefined ? dto.staffId : event.staffId,
            type: dto.type,
            reason: dto.reason ?? null,
            title: dto.title ?? null,
            notes: dto.notes ?? null,
            repeatType: dto.repeatType,
            startDateTime: new Date(dto.startDateTime),
            endDateTime: new Date(dto.endDateTime),
            daysMask: dto.daysMask ?? null,
            repeatUntil: dto.repeatUntil ? new Date(dto.repeatUntil) : null,
          },
        });
      });
    }

    return this.db.calendarEvent.update({
      where: { id: eventId },
      data: {
        staffId: dto.staffId !== undefined ? dto.staffId : event.staffId,
        type: dto.type,
        reason: dto.reason ?? null,
        title: dto.title ?? null,
        notes: dto.notes ?? null,
        repeatType: dto.repeatType,
        startDateTime: new Date(dto.startDateTime),
        endDateTime: new Date(dto.endDateTime),
        daysMask: dto.daysMask ?? null,
        repeatUntil: dto.repeatUntil ? new Date(dto.repeatUntil) : null,
      },
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
    const event = await this.db.calendarEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Calendar event not found');
    return event;
  }

  async getCalendar(businessId: string, dto: GetCalendarRequestDto): Promise<GetCalendarResponseDto> {
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    const { timezone } = business;
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
    const eventItems = this.compute.expandEvents(events, dates, timezone);
    const { minTime, maxTime, closedTime } = this.compute.computeViewAndClosedTime(dates, shiftsByDate);

    return {
      range: { from: dto.from, to: dto.to },
      timezone,
      view: { minTime, maxTime },
      closedTime,
      events: eventItems,
    };
  }

  async getAvailableSlots(businessId: string, dto: AvailableSlotsRequestDto): Promise<AvailableSlotsDayDto[]> {
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
      this.resolveStaff(businessId, dto.serviceId, dto.staffId),
    ]);

    if (!business) throw new NotFoundException('Business not found');
    if (!service) throw new NotFoundException('Service not found');
    if (candidateStaff.length === 0) return [];

    const slotDuration = service.durationMinutes + service.bufferMinutes;
    const now = new Date();
    const nowParts = this.time.toZonedParts(now, business.timezone);
    const nowMinutes = nowParts.hour * 60 + nowParts.minute;
    const todayStr = format(new Date(nowParts.year, nowParts.month - 1, nowParts.day), 'yyyy-MM-dd');

    const rangeStart = new Date(todayStr);
    const rangeEndDate = new Date(todayStr);
    rangeEndDate.setDate(rangeEndDate.getDate() + business.advanceBookingWindowDays - 1);

    const dates = eachDayOfInterval({ start: rangeStart, end: rangeEndDate }).map(
      (d) => format(d, 'yyyy-MM-dd'),
    );

    const staffIds = candidateStaff.map((s) => s.id);

    const [shifts, blockEvents] = await Promise.all([
      this.db.staffShift.findMany({
        where: {
          staffId: { in: staffIds },
          date: { gte: rangeStart, lte: rangeEndDate },
        },
      }),
      this.db.calendarEvent.findMany({
        where: {
          businessId,
          AND: [
            { OR: [{ staffId: null }, { staffId: { in: staffIds } }] },
            {
              OR: [
                { repeatType: CalendarEventRepeatType.NONE, startDateTime: { lte: rangeEndDate }, endDateTime: { gte: rangeStart } },
                { repeatType: { not: CalendarEventRepeatType.NONE }, OR: [{ repeatUntil: null }, { repeatUntil: { gte: rangeStart } }] },
              ],
            },
          ],
        },
        include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
      }),
    ]);

    // staffId → date → shift
    const shiftsByStaffDate = new Map<string, Map<string, (typeof shifts)[0]>>();
    for (const shift of shifts) {
      const dateKey = format(shift.date, 'yyyy-MM-dd');
      if (!shiftsByStaffDate.has(shift.staffId)) shiftsByStaffDate.set(shift.staffId, new Map());
      shiftsByStaffDate.get(shift.staffId)!.set(dateKey, shift);
    }

    const blockedByStaffDate = this.compute.expandBlockEvents(blockEvents, dates, staffIds, business.timezone);

    const result: AvailableSlotsDayDto[] = [];

    for (const date of dates) {
      const earliestMinute = date === todayStr ? nowMinutes + business.minimumBookingNoticeMinutes : 0;
      const slotStartSet = new Set<number>();

      for (const staff of candidateStaff) {
        const shift = shiftsByStaffDate.get(staff.id)?.get(date);
        if (!shift) continue;

        const shiftStart = this.time.timeToMinutes(shift.startTime);
        const shiftEnd = this.time.timeToMinutes(shift.endTime);
        const blocked = blockedByStaffDate.get(staff.id)?.get(date) ?? [];
        const freeIntervals = this.compute.subtractIntervals({ start: shiftStart, end: shiftEnd }, blocked);

        for (const free of freeIntervals) {
          const firstInFree = this.compute.alignSlotStart(
            Math.max(free.start, earliestMinute),
            business.slotIntervalMinutes,
          );
          let slotStart = firstInFree;
          while (slotStart + slotDuration <= free.end) {
            slotStartSet.add(slotStart);
            slotStart += business.slotIntervalMinutes;
          }
        }
      }

      if (slotStartSet.size === 0) continue;

      result.push({
        date,
        slots: [...slotStartSet]
          .sort((a, b) => a - b)
          .map((start) => ({ time: this.time.minutesToHHmm(start) })),
      });
    }

    return result;
  }

  private async resolveStaff(
    businessId: string,
    serviceId: string,
    staffId?: string,
  ): Promise<{ id: string }[]> {
    if (staffId) {
      const staff = await this.db.staff.findFirst({
        where: { id: staffId, businessId, isActive: true, staffServices: { some: { serviceId } } },
        select: { id: true },
      });
      return staff ? [staff] : [];
    }

    return this.db.staff.findMany({
      where: { businessId, isActive: true, staffServices: { some: { serviceId } } },
      select: { id: true },
    });
  }
}
