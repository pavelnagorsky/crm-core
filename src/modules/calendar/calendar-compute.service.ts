import { Injectable } from '@nestjs/common';
import { CalendarEvent, CalendarEventRepeatType, StaffShift } from '@prisma/client';
import { format, getDay, parseISO } from 'date-fns';
import { TimeService } from '../time/time.service.js';
import { CalendarEventItemDto } from './dto/calendar-event-item.dto.js';
import { ClosedTimeItemDto } from './dto/closed-time-item.dto.js';
import {
  CalendarEventWithCancellations,
  EventTimes,
  Interval,
} from './interfaces/calendar-types.interface.js';

@Injectable()
export class CalendarComputeService {
  constructor(private readonly time: TimeService) {}

  // ─── Event expansion ──────────────────────────────────────────────────────────

  /** Expands a list of calendar events into flat DTO items for the given date range. */
  expandEvents(
    events: CalendarEventWithCancellations[],
    dates: string[],
    timezone: string,
  ): CalendarEventItemDto[] {
    return events.flatMap((event) =>
      event.repeatType === CalendarEventRepeatType.NONE
        ? this.expandOneTimeEvent(event, timezone)
        : this.expandRecurringEvent(event, dates, timezone),
    );
  }

  private expandOneTimeEvent(
    event: CalendarEventWithCancellations,
    timezone: string,
  ): CalendarEventItemDto[] {
    const { date, startHHmm, endHHmm } = this.resolveEventTimes(event, timezone);
    if (this.buildCancelledSet(event).has(date)) return [];
    return [CalendarEventItemDto.fromEntity(event, date, startHHmm, endHHmm)];
  }

  private expandRecurringEvent(
    event: CalendarEventWithCancellations,
    dates: string[],
    timezone: string,
  ): CalendarEventItemDto[] {
    const times = this.resolveEventTimes(event, timezone);
    return this.occurrenceDatesFrom(event, dates, times.date)
      .map((date) => CalendarEventItemDto.fromEntity(event, date, times.startHHmm, times.endHHmm));
  }

  // ─── Block event expansion ────────────────────────────────────────────────────

  /**
   * Builds a staffId → date → blocked intervals index from calendar block events.
   * Events with no staffId are applied to all candidate staff.
   * Midnight-spanning events are split: [blockStart, 24:00) on the start date and [00:00, blockEnd) on the next.
   */
  expandBlockEvents(
    events: CalendarEventWithCancellations[],
    dates: string[],
    staffIds: string[],
    timezone: string,
  ): Map<string, Map<string, Interval[]>> {
    const result = new Map<string, Map<string, Interval[]>>();

    const push = (sid: string, date: string, interval: Interval) => {
      if (!result.has(sid)) result.set(sid, new Map());
      const byDate = result.get(sid)!;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(interval);
    };

    for (const event of events) {
      const { date: eventStartStr, startHHmm, endHHmm } = this.resolveEventTimes(event, timezone);
      const occurrenceDates = event.repeatType === CalendarEventRepeatType.NONE
        ? this.occurrenceDatesOneTime(event, dates, eventStartStr)
        : this.occurrenceDatesFrom(event, dates, eventStartStr);
      const blockStart = this.time.hhmmToMinutes(startHHmm);
      const blockEnd = this.time.hhmmToMinutes(endHHmm);
      const targetStaffIds = event.staffId ? [event.staffId] : staffIds;

      for (const sid of targetStaffIds) {
        for (const date of occurrenceDates) {
          if (blockEnd > blockStart) {
            push(sid, date, { start: blockStart, end: blockEnd });
          } else {
            // midnight-spanning: split across this date and the next
            push(sid, date, { start: blockStart, end: 24 * 60 });
            const nextDate = format(
              new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
              'yyyy-MM-dd',
            );
            push(sid, nextDate, { start: 0, end: blockEnd });
          }
        }
      }
    }

    return result;
  }

  // ─── Occurrence resolution ────────────────────────────────────────────────────

  /** Returns the subset of dates on which the event actually occurs (cancelled occurrences excluded). */
  getOccurrenceDates(
    event: CalendarEventWithCancellations,
    dates: string[],
    timezone: string,
  ): string[] {
    const { date: eventStartStr } = this.resolveEventTimes(event, timezone);
    return event.repeatType === CalendarEventRepeatType.NONE
      ? this.occurrenceDatesOneTime(event, dates, eventStartStr)
      : this.occurrenceDatesFrom(event, dates, eventStartStr);
  }

  private occurrenceDatesOneTime(
    event: CalendarEventWithCancellations,
    dates: string[],
    eventStartStr: string,
  ): string[] {
    const cancelled = this.buildCancelledSet(event);
    return !cancelled.has(eventStartStr) && dates.includes(eventStartStr)
      ? [eventStartStr]
      : [];
  }

  private occurrenceDatesFrom(
    event: CalendarEventWithCancellations,
    dates: string[],
    eventStartStr: string,
  ): string[] {
    const cancelled = this.buildCancelledSet(event);
    const repeatUntilStr = event.repeatUntil ? format(event.repeatUntil, 'yyyy-MM-dd') : null;

    return dates.filter((date) => {
      if (date < eventStartStr) return false;
      if (repeatUntilStr && date > repeatUntilStr) return false;
      if (cancelled.has(date)) return false;
      if (event.daysMask) {
        const jsDay = getDay(parseISO(date));
        // getDay: 0=Sun..6=Sat → convert to 0=Mon..6=Sun to match daysMask
        const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
        if (event.daysMask[dayOfWeek] !== '1') return false;
      }
      return true;
    });
  }

  // ─── Event time resolution ────────────────────────────────────────────────────

  /** Converts event UTC datetimes to local date and HH:mm times in the given timezone. */
  resolveEventTimes(event: CalendarEvent, timezone: string): EventTimes {
    const startParts = this.time.toZonedParts(event.startDateTime, timezone);
    const endParts = this.time.toZonedParts(event.endDateTime, timezone);
    return {
      date: format(new Date(startParts.year, startParts.month - 1, startParts.day), 'yyyy-MM-dd'),
      startHHmm: this.time.minutesToHHmm(startParts.hour * 60 + startParts.minute),
      endHHmm: this.time.minutesToHHmm(endParts.hour * 60 + endParts.minute),
    };
  }

  /** Returns a set of cancelled occurrence dates (yyyy-MM-dd) for fast lookup. */
  buildCancelledSet(event: CalendarEventWithCancellations): Set<string> {
    return new Set(
      event.cancelledOccurrences.map((o) => format(o.occurrenceDate, 'yyyy-MM-dd')),
    );
  }

  // ─── Calendar view ────────────────────────────────────────────────────────────

  /**
   * Computes the calendar view bounds (earliest shift start / latest shift end across all days)
   * and the closed-time blocks (gaps within those bounds where no staff is working).
   */
  computeViewAndClosedTime(
    dates: string[],
    shiftsByDate: Map<string, StaffShift[]>,
  ): { minTime: string; maxTime: string; closedTime: ClosedTimeItemDto[] } {
    const { viewMin, viewMax } = this.computeViewBounds(shiftsByDate);
    return {
      minTime: this.time.minutesToHHmm(viewMin),
      maxTime: this.time.minutesToHHmm(viewMax),
      closedTime: this.computeClosedTime(dates, shiftsByDate, viewMin, viewMax),
    };
  }

  private computeViewBounds(
    shiftsByDate: Map<string, StaffShift[]>,
  ): { viewMin: number; viewMax: number } {
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

    return {
      viewMin: minMinutes === Infinity ? 0 : minMinutes,
      viewMax: maxMinutes === -Infinity ? 23 * 60 + 59 : maxMinutes,
    };
  }

  private computeClosedTime(
    dates: string[],
    shiftsByDate: Map<string, StaffShift[]>,
    viewMin: number,
    viewMax: number,
  ): ClosedTimeItemDto[] {
    const closed: ClosedTimeItemDto[] = [];

    for (const date of dates) {
      const dayShifts = shiftsByDate.get(date) ?? [];
      const openIntervals = dayShifts.map((s) => ({
        start: this.time.timeToMinutes(s.startTime),
        end: this.time.timeToMinutes(s.endTime),
      }));
      for (const block of this.subtractIntervals({ start: viewMin, end: viewMax }, openIntervals)) {
        closed.push({
          date,
          startTime: this.time.minutesToHHmm(block.start),
          endTime: this.time.minutesToHHmm(block.end),
        });
      }
    }

    return closed;
  }

  // ─── Interval arithmetic ──────────────────────────────────────────────────────

  /**
   * Returns the gaps inside `view` that are not covered by any of `openIntervals`.
   * Pass shift intervals as `openIntervals` to get the blocked (closed) portions of a day,
   * or pass blocked intervals to get the free (bookable) portions.
   */
  subtractIntervals(view: Interval, openIntervals: Interval[]): Interval[] {
    if (openIntervals.length === 0) return [view];

    const sorted = [...openIntervals]
      .filter((i) => i.start < i.end)
      .sort((a, b) => a.start - b.start);

    const merged: Interval[] = [];
    for (const interval of sorted) {
      const clamped = {
        start: Math.max(interval.start, view.start),
        end: Math.min(interval.end, view.end),
      };
      if (clamped.start >= clamped.end) continue;
      if (merged.length === 0 || clamped.start > merged[merged.length - 1].end) {
        merged.push(clamped);
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, clamped.end);
      }
    }

    const closed: Interval[] = [];
    let cursor = view.start;
    for (const open of merged) {
      if (open.start > cursor) closed.push({ start: cursor, end: open.start });
      cursor = Math.max(cursor, open.end);
    }
    if (cursor < view.end) closed.push({ start: cursor, end: view.end });
    return closed;
  }

  /** Rounds `from` up to the nearest multiple of `intervalMinutes` (the slot grid). */
  alignSlotStart(from: number, intervalMinutes: number): number {
    return Math.ceil(from / intervalMinutes) * intervalMinutes;
  }

  /** Groups shifts by date string (yyyy-MM-dd) → array of shifts. Used for calendar view. */
  groupShiftsByDate(shifts: StaffShift[]): Map<string, StaffShift[]> {
    const map = new Map<string, StaffShift[]>();
    for (const shift of shifts) {
      const key = format(shift.date, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(shift);
    }
    return map;
  }

  /** Indexes shifts as staffId → date string → shift for O(1) lookup during slot generation. */
  groupShiftsByStaffDate(shifts: StaffShift[]): Map<string, Map<string, StaffShift>> {
    const map = new Map<string, Map<string, StaffShift>>();
    for (const shift of shifts) {
      const dateKey = format(shift.date, 'yyyy-MM-dd');
      if (!map.has(shift.staffId)) map.set(shift.staffId, new Map());
      map.get(shift.staffId)!.set(dateKey, shift);
    }
    return map;
  }

  /**
   * Returns sorted unique slot start minutes for a single date across all candidate staff.
   * For each staff member: subtracts blocked intervals from their shift, then fills the
   * remaining free intervals with slots spaced `slotInterval` minutes apart.
   * Slots before `earliestMinute` are skipped (minimum booking notice enforcement).
   */
  collectSlotsForDate(
    date: string,
    candidateStaff: { id: string }[],
    shiftsByStaffDate: Map<string, Map<string, StaffShift>>,
    blockedByStaffDate: Map<string, Map<string, Interval[]>>,
    earliestMinute: number,
    slotDuration: number,
    slotInterval: number,
  ): number[] {
    const slotStartSet = new Set<number>();

    for (const staff of candidateStaff) {
      const shift = shiftsByStaffDate.get(staff.id)?.get(date);
      if (!shift) continue;

      const shiftStart = this.time.timeToMinutes(shift.startTime);
      const shiftEnd = this.time.timeToMinutes(shift.endTime);
      const blocked = blockedByStaffDate.get(staff.id)?.get(date) ?? [];

      for (const free of this.subtractIntervals({ start: shiftStart, end: shiftEnd }, blocked)) {
        let slotStart = this.alignSlotStart(Math.max(free.start, earliestMinute), slotInterval);
        while (slotStart + slotDuration <= free.end) {
          slotStartSet.add(slotStart);
          slotStart += slotInterval;
        }
      }
    }

    return [...slotStartSet].sort((a, b) => a - b);
  }
}
