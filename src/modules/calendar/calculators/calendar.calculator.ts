import { Injectable } from '@nestjs/common';
import {
  CalendarEvent,
  CalendarEventRepeatType,
  CalendarEventType,
  StaffShift,
} from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { CalendarEventItemDto } from '../dto/calendar-event-item.dto.js';
import { ClosedTimeItemDto } from '../dto/closed-time-item.dto.js';
import { CalendarRescheduleItem } from '../interfaces/calendar-reschedule-item.interface.js';
import { CalendarShift } from '../interfaces/calendar-shift.interface.js';
import { CalendarSlotCandidate } from '../interfaces/calendar-slot-candidate.interface.js';
import { CalendarSlotItem } from '../interfaces/calendar-slot-item.interface.js';
import {
  CalendarEventWithCancellations,
  EventTimes,
  Interval,
} from '../interfaces/calendar-types.interface.js';

@Injectable()
export class CalendarCalculator {
  collectRescheduleSlotsForDate(
    date: string,
    items: CalendarRescheduleItem[],
    shifts: Map<string, Map<string, CalendarShift>>,
    blocked: Map<string, Map<string, Interval[]>>,
    earliestStart: Date,
    slotInterval: number,
    timezone: string,
  ): number[] {
    if (
      !items.length ||
      items.some((item, index) =>
        items
          .slice(index + 1)
          .some(
            (other) =>
              item.staffId === other.staffId &&
              item.startAt < other.endAt &&
              other.startAt < item.endAt,
          ),
      )
    )
      return [];
    const originalStart = Math.min(
      ...items.map((item) => item.startAt.getTime()),
    );
    const result: number[] = [];
    for (let minute = 0; minute < 1440; minute += slotInterval) {
      const localStart = `${date}T${TimeUtils.minutesToHHmm(minute)}:00`;
      const startAt = TimeUtils.localToUtc(localStart, timezone);
      if (
        startAt < earliestStart ||
        TimeUtils.dateToMinutes(startAt, timezone) !== minute
      )
        continue;
      const delta = startAt.getTime() - originalStart;
      const fits = items.every((item) => {
        const start = new Date(item.startAt.getTime() + delta);
        const end = new Date(item.endAt.getTime() + delta);
        const itemDate = TimeUtils.zonedDateStr(start, timezone);
        if (end <= start) return false;
        const midnight = TimeUtils.localToUtc(
          `${TimeUtils.addDaysStr(itemDate, 1)}T00:00:00`,
          timezone,
        );
        if (end > midnight) return false;
        const from = TimeUtils.dateToMinutes(start, timezone);
        const to =
          end.getTime() === midnight.getTime()
            ? 1440
            : TimeUtils.dateToMinutes(end, timezone);
        return this.isStaffFreeOnDate(
          item.staffId,
          itemDate,
          from,
          to,
          shifts,
          blocked,
        );
      });
      if (fits) result.push(minute);
    }
    return result;
  }

  // ─── Event expansion ──────────────────────────────────────────────────────────

  /**
   * One-time blocks are included when their interval overlaps [rangeStart, rangeEnd).
   * Weekly series are expanded onto occurrence dates inside `dates`.
   */
  expandEvents(
    events: CalendarEventWithCancellations[],
    dates: string[],
    timezone: string,
    rangeStart: Date,
    rangeEnd: Date,
    staffNames: ReadonlyMap<string, string>,
  ): CalendarEventItemDto[] {
    return events.flatMap((event) =>
      event.repeatType === CalendarEventRepeatType.NONE
        ? this.expandOneTimeEvent(
            event,
            timezone,
            rangeStart,
            rangeEnd,
            staffNames,
          )
        : this.expandRecurringEvent(event, dates, timezone, staffNames),
    );
  }

  private expandOneTimeEvent(
    event: CalendarEventWithCancellations,
    timezone: string,
    rangeStart: Date,
    rangeEnd: Date,
    staffNames: ReadonlyMap<string, string>,
  ): CalendarEventItemDto[] {
    if (event.startDateTime >= rangeEnd || event.endDateTime <= rangeStart)
      return [];
    const { date, startHHmm, endHHmm } = this.resolveEventTimes(
      event,
      timezone,
    );
    if (this.buildCancelledSet(event).has(date)) return [];
    return [this.blockItem(event, date, startHHmm, endHHmm, staffNames)];
  }

  private expandRecurringEvent(
    event: CalendarEventWithCancellations,
    dates: string[],
    timezone: string,
    staffNames: ReadonlyMap<string, string>,
  ): CalendarEventItemDto[] {
    const times = this.resolveEventTimes(event, timezone);
    return this.occurrenceDatesFrom(event, dates, times.date).map((date) =>
      this.blockItem(event, date, times.startHHmm, times.endHHmm, staffNames),
    );
  }

  private blockItem(
    event: CalendarEventWithCancellations,
    date: string,
    startTime: string,
    endTime: string,
    staffNames: ReadonlyMap<string, string>,
  ): CalendarEventItemDto {
    const staffName = event.staffId
      ? (staffNames.get(event.staffId) ?? null)
      : null;
    if (event.type === CalendarEventType.INTEGRATION) {
      return CalendarEventItemDto.integration(
        event,
        date,
        startTime,
        endTime,
        staffName,
      );
    }
    return CalendarEventItemDto.block(
      event,
      date,
      startTime,
      endTime,
      staffName,
    );
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

    const requestedDates = new Set(dates);
    for (const event of events) {
      const {
        date: eventDate,
        startHHmm,
        endHHmm,
      } = this.resolveEventTimes(event, timezone);
      const targetStaffIds = event.staffId ? [event.staffId] : staffIds;
      if (event.repeatType === CalendarEventRepeatType.NONE) {
        if (this.buildCancelledSet(event).has(eventDate)) continue;
        for (const date of dates) {
          const dayStart = TimeUtils.localToUtc(`${date}T00:00:00`, timezone);
          const dayEnd = TimeUtils.localToUtc(
            `${TimeUtils.addDaysStr(date, 1)}T00:00:00`,
            timezone,
          );
          if (event.startDateTime >= dayEnd || event.endDateTime <= dayStart)
            continue;
          const interval = {
            start:
              event.startDateTime <= dayStart
                ? 0
                : TimeUtils.dateToMinutes(event.startDateTime, timezone),
            end:
              event.endDateTime >= dayEnd
                ? 1440
                : TimeUtils.dateToMinutes(event.endDateTime, timezone),
          };
          for (const staffId of targetStaffIds) push(staffId, date, interval);
        }
        continue;
      }

      const blockStart = TimeUtils.hhmmToMinutes(startHHmm);
      const blockEnd = TimeUtils.hhmmToMinutes(endHHmm);
      // Include yesterday so a recurring block that crosses midnight still blocks today's early slots.
      const candidateDates =
        blockEnd <= blockStart
          ? [
              ...new Set([
                ...dates,
                ...dates.map((date) => TimeUtils.addDaysStr(date, -1)),
              ]),
            ]
          : dates;
      for (const date of this.occurrenceDatesFrom(
        event,
        candidateDates,
        eventDate,
      )) {
        for (const staffId of targetStaffIds) {
          if (blockEnd > blockStart) {
            push(staffId, date, { start: blockStart, end: blockEnd });
          } else {
            if (requestedDates.has(date))
              push(staffId, date, { start: blockStart, end: 1440 });
            const nextDate = TimeUtils.addDaysStr(date, 1);
            if (requestedDates.has(nextDate))
              push(staffId, nextDate, { start: 0, end: blockEnd });
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
    const repeatUntilStr = event.repeatUntil
      ? TimeUtils.dateOnlyStr(event.repeatUntil)
      : null;

    return dates.filter((date) => {
      if (date < eventStartStr) return false;
      if (repeatUntilStr && date > repeatUntilStr) return false;
      if (cancelled.has(date)) return false;
      if (event.daysMask) {
        const [y, m, d] = date.split('-').map(Number);
        // daysMask is indexed 0=Mon..6=Sun; isoWeekday returns 1=Mon..7=Sun.
        const dayOfWeek = TimeUtils.isoWeekday(y, m, d) - 1;
        if (event.daysMask[dayOfWeek] !== '1') return false;
      }
      return true;
    });
  }

  // ─── Event time resolution ────────────────────────────────────────────────────

  /** Converts event UTC datetimes to local date and HH:mm times in the given timezone. */
  resolveEventTimes(event: CalendarEvent, timezone: string): EventTimes {
    const startParts = TimeUtils.toZonedParts(event.startDateTime, timezone);
    const endParts = TimeUtils.toZonedParts(event.endDateTime, timezone);
    return {
      date: TimeUtils.zonedDateStr(event.startDateTime, timezone),
      startHHmm: TimeUtils.minutesToHHmm(
        startParts.hour * 60 + startParts.minute,
      ),
      endHHmm: TimeUtils.minutesToHHmm(endParts.hour * 60 + endParts.minute),
    };
  }

  /** Returns a set of cancelled occurrence dates (yyyy-MM-dd) for fast lookup. */
  buildCancelledSet(event: CalendarEventWithCancellations): Set<string> {
    return new Set(
      event.cancelledOccurrences.map((o) =>
        TimeUtils.dateOnlyStr(o.occurrenceDate),
      ),
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
      minTime: TimeUtils.minutesToHHmm(viewMin),
      maxTime: TimeUtils.minutesToHHmm(viewMax),
      closedTime: this.computeClosedTime(dates, shiftsByDate, viewMin, viewMax),
    };
  }

  private computeViewBounds(shiftsByDate: Map<string, StaffShift[]>): {
    viewMin: number;
    viewMax: number;
  } {
    let minMinutes = Infinity;
    let maxMinutes = -Infinity;

    for (const dayShifts of shiftsByDate.values()) {
      for (const s of dayShifts) {
        const start = TimeUtils.timeToMinutes(s.startTime);
        const end = TimeUtils.timeToMinutes(s.endTime);
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
        start: TimeUtils.timeToMinutes(s.startTime),
        end: TimeUtils.timeToMinutes(s.endTime),
      }));
      for (const block of this.subtractIntervals(
        { start: viewMin, end: viewMax },
        openIntervals,
      )) {
        closed.push({
          date,
          startTime: TimeUtils.minutesToHHmm(block.start),
          endTime: TimeUtils.minutesToHHmm(block.end),
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
      const key = TimeUtils.dateOnlyStr(shift.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(shift);
    }
    return map;
  }

  /** Indexes shifts as staffId → date string → shift for O(1) lookup during slot generation. */
  groupShiftsByStaffDate(
    shifts: CalendarShift[],
  ): Map<string, Map<string, CalendarShift>> {
    const map = new Map<string, Map<string, CalendarShift>>();
    for (const shift of shifts) {
      const dateKey = TimeUtils.dateOnlyStr(shift.date);
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
    candidateStaff: CalendarSlotCandidate[],
    shiftsByStaffDate: Map<string, Map<string, CalendarShift>>,
    blockedByStaffDate: Map<string, Map<string, Interval[]>>,
    earliestMinute: number,
    slotDuration: number,
    slotInterval: number,
  ): number[] {
    const slotStartSet = new Set<number>();

    for (const staff of candidateStaff) {
      const shift = shiftsByStaffDate.get(staff.id)?.get(date);
      if (!shift) continue;

      const shiftStart = TimeUtils.timeToMinutes(shift.startTime);
      const shiftEnd = TimeUtils.timeToMinutes(shift.endTime);
      const blocked = blockedByStaffDate.get(staff.id)?.get(date) ?? [];

      for (const free of this.subtractIntervals(
        { start: shiftStart, end: shiftEnd },
        blocked,
      )) {
        let slotStart = this.alignSlotStart(
          Math.max(free.start, earliestMinute),
          slotInterval,
        );
        while (slotStart + slotDuration <= free.end) {
          slotStartSet.add(slotStart);
          slotStart += slotInterval;
        }
      }
    }

    return [...slotStartSet].sort((a, b) => a - b);
  }

  collectMultiServiceSlotsForDate(
    date: string,
    items: CalendarSlotItem[],
    executionMode: string,
    candidatesByService: Map<string, CalendarSlotCandidate[]>,
    shiftsByStaffDate: Map<string, Map<string, CalendarShift>>,
    blockedByStaffDate: Map<string, Map<string, Interval[]>>,
    earliestMinute: number,
    slotInterval: number,
  ): number[] {
    const staffIds = this.uniqueCandidates(candidatesByService).map(
      (staff) => staff.id,
    );
    const shifts = staffIds
      .map((staffId) => shiftsByStaffDate.get(staffId)?.get(date))
      .filter((shift): shift is CalendarShift => !!shift);
    if (shifts.length === 0) return [];

    const minStart = Math.min(
      ...shifts.map((shift) => TimeUtils.timeToMinutes(shift.startTime)),
    );
    const maxEnd = Math.max(
      ...shifts.map((shift) => TimeUtils.timeToMinutes(shift.endTime)),
    );
    const envelopeDuration =
      executionMode === 'PARALLEL'
        ? Math.max(...items.map((item) => item.durationMinutes))
        : items.reduce((sum, item) => sum + item.durationMinutes, 0);
    const slots: number[] = [];
    let slotStart = this.alignSlotStart(
      Math.max(minStart, earliestMinute),
      slotInterval,
    );

    while (slotStart + envelopeDuration <= maxEnd) {
      if (
        this.canAssignItems(
          date,
          slotStart,
          items,
          executionMode,
          candidatesByService,
          shiftsByStaffDate,
          blockedByStaffDate,
        )
      ) {
        slots.push(slotStart);
      }
      slotStart += slotInterval;
    }

    return slots;
  }

  private canAssignItems(
    date: string,
    slotStart: number,
    items: CalendarSlotItem[],
    executionMode: string,
    candidatesByService: Map<string, CalendarSlotCandidate[]>,
    shiftsByStaffDate: Map<string, Map<string, CalendarShift>>,
    blockedByStaffDate: Map<string, Map<string, Interval[]>>,
  ): boolean {
    const windows = items.map((item, index) => {
      const offset =
        executionMode === 'PARALLEL'
          ? 0
          : items
              .slice(0, index)
              .reduce((sum, previous) => sum + previous.durationMinutes, 0);
      return {
        serviceId: item.serviceId,
        start: slotStart + offset,
        end: slotStart + offset + item.durationMinutes,
      };
    });
    const used = new Set<string>();
    const assign = (index: number): boolean => {
      if (index >= windows.length) return true;
      const window = windows[index];
      const candidates = candidatesByService.get(window.serviceId) ?? [];
      for (const candidate of candidates) {
        if (executionMode === 'PARALLEL' && used.has(candidate.id)) continue;
        if (
          !this.isStaffFreeOnDate(
            candidate.id,
            date,
            window.start,
            window.end,
            shiftsByStaffDate,
            blockedByStaffDate,
          )
        )
          continue;
        used.add(candidate.id);
        if (assign(index + 1)) return true;
        used.delete(candidate.id);
      }
      return false;
    };
    return assign(0);
  }

  private isStaffFreeOnDate(
    staffId: string,
    date: string,
    start: number,
    end: number,
    shiftsByStaffDate: Map<string, Map<string, CalendarShift>>,
    blockedByStaffDate: Map<string, Map<string, Interval[]>>,
  ): boolean {
    const shift = shiftsByStaffDate.get(staffId)?.get(date);
    if (!shift) return false;
    const shiftStart = TimeUtils.timeToMinutes(shift.startTime);
    const shiftEnd = TimeUtils.timeToMinutes(shift.endTime);
    if (start < shiftStart || end > shiftEnd) return false;
    const blocked = blockedByStaffDate.get(staffId)?.get(date) ?? [];
    return !blocked.some((block) => start < block.end && end > block.start);
  }

  private uniqueCandidates(
    candidatesByService: Map<string, CalendarSlotCandidate[]>,
  ): CalendarSlotCandidate[] {
    const byId = new Map<string, CalendarSlotCandidate>();
    for (const candidates of candidatesByService.values()) {
      for (const candidate of candidates) byId.set(candidate.id, candidate);
    }
    return [...byId.values()];
  }
}
