import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CalendarEvent,
  CalendarEventRepeatType,
  StaffShift,
} from '@prisma/client';
import { eachDayOfInterval, format, getDay, parseISO } from 'date-fns';
import { DatabaseService } from '../../database/database.service.js';
import { TimeService } from '../time/time.service.js';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';
import { DeleteCalendarEventDto } from './dto/delete-calendar-event.dto.js';
import { GetCalendarRequestDto } from './dto/get-calendar-request.dto.js';
import { GetCalendarResponseDto } from './dto/get-calendar-response.dto.js';
import { CalendarEventItemDto } from './dto/calendar-event-item.dto.js';
import { ClosedTimeItemDto } from './dto/closed-time-item.dto.js';

type CalendarEventWithCancellations = CalendarEvent & {
  cancelledOccurrences: { occurrenceDate: Date }[];
};

@Injectable()
export class CalendarService {
  constructor(
    private readonly db: DatabaseService,
    private readonly time: TimeService,
  ) {}

  async create(
    businessId: string,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEvent[]> {
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

  async update(
    eventId: string,
    dto: UpdateCalendarEventDto,
  ): Promise<CalendarEvent> {
    const event = await this.findById(eventId);

    if (dto.thisOnly) {
      // Cancel the original occurrence and create a standalone replacement
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
    });
    if (!business) throw new NotFoundException('Business not found');

    const timezone = business.timezone;
    const rangeStart = new Date(dto.from);
    const rangeEnd = new Date(dto.to);

    const dates = eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map(
      (d) => format(d, 'yyyy-MM-dd'),
    );

    // Load shifts — for requested staff members (or all staff if no filter)
    const shifts = await this.db.staffShift.findMany({
      where: {
        staff: { businessId },
        date: { gte: rangeStart, lte: rangeEnd },
        ...(dto.staffIds?.length ? { staffId: { in: dto.staffIds } } : {}),
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    // Load calendar events — staff filter + always include business-level (staffId=null)
    const staffFilter = dto.staffIds?.length
      ? { OR: [{ staffId: null }, { staffId: { in: dto.staffIds } }] }
      : {};

    const events = await this.db.calendarEvent.findMany({
      where: {
        businessId,
        ...staffFilter,
      },
      include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
    });

    // Expand recurring events into occurrences within the date range
    const eventItems = this.expandEvents(events, dates, timezone);

    // Group shifts by YYYY-MM-DD (shifts use @db.Date — UTC midnight — and @db.Time — naive UTC HH:mm)
    const shiftsByDate = new Map<string, StaffShift[]>();
    for (const shift of shifts) {
      const dateKey = format(shift.date, 'yyyy-MM-dd');
      if (!shiftsByDate.has(dateKey)) shiftsByDate.set(dateKey, []);
      shiftsByDate.get(dateKey)!.push(shift);
    }

    const { minTime, maxTime, closedTime } = this.computeViewAndClosedTime(
      dates,
      shiftsByDate,
    );

    return {
      range: { from: dto.from, to: dto.to },
      timezone,
      view: { minTime, maxTime },
      closedTime,
      events: eventItems,
    };
  }

  private expandEvents(
    events: CalendarEventWithCancellations[],
    dates: string[],
    timezone: string,
  ): CalendarEventItemDto[] {
    const result: CalendarEventItemDto[] = [];

    for (const event of events) {
      const cancelledSet = new Set(
        event.cancelledOccurrences.map((o) =>
          format(o.occurrenceDate, 'yyyy-MM-dd'),
        ),
      );

      if (event.repeatType === CalendarEventRepeatType.NONE) {
        const startParts = this.time.toZonedParts(
          event.startDateTime,
          timezone,
        );
        const endParts = this.time.toZonedParts(event.endDateTime, timezone);
        const date = format(
          new Date(startParts.year, startParts.month - 1, startParts.day),
          'yyyy-MM-dd',
        );

        if (!cancelledSet.has(date)) {
          result.push({
            id: event.id,
            staffId: event.staffId,
            type: event.type,
            reason: event.reason,
            title: event.title,
            notes: event.notes,
            repeatType: event.repeatType,
            date,
            startTime: this.time.minutesToHHmm(
              startParts.hour * 60 + startParts.minute,
            ),
            endTime: this.time.minutesToHHmm(
              endParts.hour * 60 + endParts.minute,
            ),
          });
        }
      } else {
        // Weekly recurring — check daysMask and repeatUntil
        const repeatUntilStr = event.repeatUntil
          ? format(event.repeatUntil, 'yyyy-MM-dd')
          : null;

        const startParts = this.time.toZonedParts(
          event.startDateTime,
          timezone,
        );
        const endParts = this.time.toZonedParts(event.endDateTime, timezone);
        const eventStartStr = format(
          new Date(startParts.year, startParts.month - 1, startParts.day),
          'yyyy-MM-dd',
        );
        const startHHmm = this.time.minutesToHHmm(
          startParts.hour * 60 + startParts.minute,
        );
        const endHHmm = this.time.minutesToHHmm(
          endParts.hour * 60 + endParts.minute,
        );

        for (const date of dates) {
          if (repeatUntilStr && date > repeatUntilStr) continue;
          if (date < eventStartStr) continue;
          if (cancelledSet.has(date)) continue;

          // getDay returns 0=Sun..6=Sat; convert to 0=Mon..6=Sun to match daysMask
          const jsDay = getDay(parseISO(date));
          const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
          if (event.daysMask && event.daysMask[dayOfWeek] !== '1') continue;

          result.push({
            id: event.id,
            staffId: event.staffId,
            type: event.type,
            reason: event.reason,
            title: event.title,
            notes: event.notes,
            repeatType: event.repeatType,
            date,
            startTime: startHHmm,
            endTime: endHHmm,
          });
        }
      }
    }

    return result;
  }

  private computeViewAndClosedTime(
    dates: string[],
    shiftsByDate: Map<string, StaffShift[]>,
  ): { minTime: string; maxTime: string; closedTime: ClosedTimeItemDto[] } {
    let minMinutes = Infinity;
    let maxMinutes = -Infinity;
    for (const dayShifts of shiftsByDate.values()) {
      for (const s of dayShifts) {
        const start = this.time.timeToMinutes(s.startTime);
        const end = this.time.timeToMinutes(s.endTime);
        if (start < minMinutes) minMinutes = start;
        if (end > maxMinutes) maxMinutes = end;
      }
    }
    const viewMin = minMinutes === Infinity ? 0 : minMinutes;
    const viewMax = maxMinutes === -Infinity ? 24 * 60 : maxMinutes;

    const closedTime: ClosedTimeItemDto[] = [];
    for (const date of dates) {
      const dayShifts = shiftsByDate.get(date) ?? [];
      const openIntervals = dayShifts.map((s) => ({
        start: this.time.timeToMinutes(s.startTime),
        end: this.time.timeToMinutes(s.endTime),
      }));
      const closed = this.subtractIntervals(
        { start: viewMin, end: viewMax },
        openIntervals,
      );
      for (const block of closed) {
        closedTime.push({
          date,
          startTime: this.time.minutesToHHmm(block.start),
          endTime: this.time.minutesToHHmm(block.end),
        });
      }
    }

    return {
      minTime:
        minMinutes === Infinity ? '00:00' : this.time.minutesToHHmm(minMinutes),
      maxTime:
        maxMinutes === -Infinity
          ? '24:00'
          : this.time.minutesToHHmm(maxMinutes),
      closedTime,
    };
  }

  private subtractIntervals(
    view: { start: number; end: number },
    openIntervals: { start: number; end: number }[],
  ): { start: number; end: number }[] {
    if (openIntervals.length === 0) return [view];

    const sorted = [...openIntervals]
      .filter((i) => i.start < i.end)
      .sort((a, b) => a.start - b.start);

    const merged: { start: number; end: number }[] = [];
    for (const interval of sorted) {
      const clamped = {
        start: Math.max(interval.start, view.start),
        end: Math.min(interval.end, view.end),
      };
      if (clamped.start >= clamped.end) continue;
      if (
        merged.length === 0 ||
        clamped.start > merged[merged.length - 1].end
      ) {
        merged.push(clamped);
      } else {
        merged[merged.length - 1].end = Math.max(
          merged[merged.length - 1].end,
          clamped.end,
        );
      }
    }

    const closed: { start: number; end: number }[] = [];
    let cursor = view.start;
    for (const open of merged) {
      if (open.start > cursor) closed.push({ start: cursor, end: open.start });
      cursor = Math.max(cursor, open.end);
    }
    if (cursor < view.end) closed.push({ start: cursor, end: view.end });
    return closed;
  }
}
