import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { BookingVisibility, CalendarEventType } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { assignStaff } from '../../../../shared/scheduling/assign-staff.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { normalizeStaffAssignments } from '../../../../shared/scheduling/normalize-staff-assignments.js';
import { hasStaffOverlap } from '../../../../shared/scheduling/has-staff-overlap.js';
import { LocationService } from '../../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { CalendarCalculator } from '../../calculators/calendar.calculator.js';
import { AvailableSlotsDayDto } from '../../dto/available-slots-day.dto.js';
import { AvailableSlotsRequestDto } from '../../dto/available-slots-request.dto.js';
import { ManualAvailableSlotsRequestDto } from '../../dto/manual-available-slots-request.dto.js';
import { SlotCheckRequestDto } from '../../dto/slot-check-request.dto.js';
import { SlotConflictReason } from '../../enums/slot-conflict-reason.enum.js';
import { SlotCheckResult } from '../../interfaces/slot-check-result.interface.js';
import { CalendarRescheduleItem } from '../../interfaces/calendar-reschedule-item.interface.js';
import { CalendarSlotCandidate } from '../../interfaces/calendar-slot-candidate.interface.js';
import { CalendarSlotItem } from '../../interfaces/calendar-slot-item.interface.js';
import { CalendarSlotOffers } from '../../interfaces/calendar-slot-offers.interface.js';
import { CalendarSlotOffersDay } from '../../interfaces/calendar-slot-offers-day.interface.js';
import { CalendarSlotSelection } from '../../interfaces/calendar-slot-selection.interface.js';
import { CalendarEventWithCancellations } from '../../interfaces/calendar-types.interface.js';
import { blockingEventsWhere } from '../../rules/blocking-events-where.js';

const MANUAL_AVAILABLE_SLOTS_MAX_DAYS = 62;
/** Item key of a request without services (free starts only). */
const START_ONLY_ITEM = 'start';

@Injectable()
export class CalendarAvailabilityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly staff: StaffService,
    private readonly locationService: LocationService,
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly compute: CalendarCalculator,
  ) {}

  /**
   * Public slots of a selection with the free candidate staff of every item, inside the
   * advance-booking window and after the minimum notice. Prices are not known here: the
   * caller ranks the candidates and prices the visit.
   */
  async getPublicSlotOffers(
    locationId: string,
    dto: AvailableSlotsRequestDto,
  ): Promise<CalendarSlotOffers> {
    const {
      business,
      candidateStaff,
      slotItems,
      executionMode,
      candidatesByService,
    } = await this.loadSlotCandidates(locationId, dto);
    if (business.bookingVisibility === BookingVisibility.PRIVATE) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_AVAILABLE,
        HttpStatus.FORBIDDEN,
      );
    }
    const offers = {
      items: slotItems,
      executionMode,
      days: [] as CalendarSlotOffersDay[],
    };
    if (candidateStaff.length === 0) return offers;

    const { todayStr, nowMinutes, rangeStart, rangeEnd } =
      this.resolveBookingWindow(business);
    const window = await this.loadSlotWindow({
      locationId,
      timezone: business.timezone,
      candidateStaff,
      rangeStart,
      rangeEnd,
    });
    const slotInterval = business.slotIntervalMinutes;
    const earliestToday = nowMinutes + business.minimumBookingNoticeMinutes;
    offers.days = window.dates.flatMap((date) => {
      const earliestMinute = date === todayStr ? earliestToday : 0;
      const starts =
        slotItems.length === 1
          ? this.compute.collectSlotStartsForDate(
              date,
              candidateStaff,
              window.shiftsByStaffDate,
              window.blockedByStaffDate,
              earliestMinute,
              slotItems[0].durationMinutes,
              slotInterval,
            )
          : this.compute.collectMultiServiceSlotStartsForDate(
              date,
              slotItems,
              executionMode,
              candidatesByService,
              window.shiftsByStaffDate,
              window.blockedByStaffDate,
              earliestMinute,
              slotInterval,
            );
      return starts.length
        ? [
            {
              date,
              slots: starts.map((start) => ({
                time: TimeUtils.minutesToHHmm(start.minute),
                freeStaffIds: start.freeStaffIds,
              })),
            },
          ]
        : [];
    });
    return offers;
  }

  async getManualAvailableSlots(
    locationId: string,
    dto: ManualAvailableSlotsRequestDto,
    excludedCalendarEventIds: string[] = [],
  ): Promise<AvailableSlotsDayDto[]> {
    const { from, to } = this.manualSlotRange(dto.from, dto.to);
    const {
      business,
      service,
      candidateStaff,
      slotItems,
      executionMode,
      candidatesByService,
    } = await this.loadSlotCandidates(locationId, dto, true);
    if (candidateStaff.length === 0) return [];

    const todayStr = TimeUtils.zonedDateStr(new Date(), business.timezone);
    const effectiveFrom = from < todayStr ? todayStr : from;
    if (effectiveFrom > to) return [];
    return this.collectSlotDays({
      locationId,
      timezone: business.timezone,
      slotIntervalMinutes: business.slotIntervalMinutes,
      service,
      candidateStaff,
      slotItems,
      executionMode,
      candidatesByService,
      todayStr,
      earliestMinuteToday: 0,
      rangeStart: TimeUtils.dateOnly(effectiveFrom),
      rangeEnd: new Date(`${to}T23:59:59.999Z`),
      excludedCalendarEventIds,
    });
  }

  /**
   * Whether a manual visit fits at a given start under the manual-slot rules, and otherwise the
   * first obstacle. Services follow each other, or start together in a parallel bundle.
   * Without services only the start is checked, for one booking step.
   */
  async checkManualSlot(
    locationId: string,
    dto: SlotCheckRequestDto,
  ): Promise<SlotCheckResult> {
    const { business, slotItems, executionMode, candidatesByService } =
      await this.loadSlotCandidates(locationId, dto, true);
    const { timezone } = business;
    const date = dto.startAt.slice(0, 10);
    const startMinute = TimeUtils.hhmmToMinutes(dto.startAt.slice(11, 16));
    const parallel = executionMode === 'PARALLEL';
    let cursor = startMinute;
    const items = slotItems.map((item, index) => {
      const start = parallel ? startMinute : cursor;
      const end = start + item.durationMinutes;
      cursor = end;
      return {
        itemId: String(index),
        start,
        end,
        candidates: candidatesByService.get(item.serviceId) ?? [],
      };
    });
    const endMinute = Math.max(...items.map((item) => item.end));
    const staffIds = [
      ...new Set(
        items.flatMap((item) => item.candidates.map((staff) => staff.id)),
      ),
    ];
    const startAt = TimeUtils.localToUtc(dto.startAt, timezone);
    const [shifts, events] = await Promise.all([
      this.staff.listShiftsForStaff(
        staffIds,
        TimeUtils.dateOnly(date),
        TimeUtils.dateOnly(date),
      ),
      staffIds.length
        ? this.db.calendarEvent.findMany({
            where: blockingEventsWhere(
              locationId,
              staffIds,
              startAt,
              new Date(startAt.getTime() + (endMinute - startMinute) * 60_000),
            ),
            include: {
              cancelledOccurrences: { select: { occurrenceDate: true } },
            },
          })
        : [],
    ]);
    const shiftsByStaffDate = this.compute.groupShiftsByStaffDate(shifts);
    const expand = (bookings: boolean) =>
      this.compute.expandBlockEvents(
        events.filter(
          (event) => (event.type === CalendarEventType.BOOKING) === bookings,
        ),
        [date],
        staffIds,
        timezone,
      );
    const bookingsByStaffDate = expand(true);
    const blocksByStaffDate = expand(false);
    const checked = items.map((item) => ({
      ...item,
      conflicts: item.candidates.map((staff) => ({
        staffId: staff.id,
        conflict: this.compute.findSlotConflict(
          staff.id,
          date,
          item.start,
          item.end,
          shiftsByStaffDate,
          bookingsByStaffDate,
          blocksByStaffDate,
        ),
      })),
    }));
    const local = (minute: number) =>
      minute >= 1440
        ? `${TimeUtils.addDaysStr(date, 1)}T${TimeUtils.minutesToHHmm(minute - 1440)}:00`
        : `${date}T${TimeUtils.minutesToHHmm(minute)}:00`;
    const result: SlotCheckResult = {
      available: false,
      reason: null,
      staffId: null,
      conflictStart: null,
      conflictEnd: null,
      startAt: local(startMinute),
      endAt: local(endMinute),
    };
    const team = assignStaff(
      checked.map((item) => ({
        itemId: item.itemId,
        staffIds: item.conflicts
          .filter((entry) => !entry.conflict)
          .map((entry) => entry.staffId),
      })),
      parallel,
    );
    if (team) return { ...result, available: true };
    // Report the first service nobody can take; a single possible staff member gives a precise reason.
    const blocked = checked.find((item) =>
      item.conflicts.every((entry) => entry.conflict),
    );
    const only = blocked?.conflicts.length === 1 ? blocked.conflicts[0] : null;
    if (!only?.conflict)
      return { ...result, reason: SlotConflictReason.NO_STAFF };
    return {
      ...result,
      reason: only.conflict.reason,
      staffId: only.staffId,
      conflictStart: local(only.conflict.start),
      conflictEnd: local(only.conflict.end),
    };
  }

  getRescheduleSlots(
    locationId: string,
    items: CalendarRescheduleItem[],
    from: string,
    to: string,
  ): Promise<AvailableSlotsDayDto[]> {
    return this.collectRescheduleSlots(locationId, items, from, to, false);
  }

  getManualRescheduleSlots(
    locationId: string,
    items: CalendarRescheduleItem[],
    from: string,
    to: string,
  ): Promise<AvailableSlotsDayDto[]> {
    return this.collectRescheduleSlots(locationId, items, from, to, true);
  }

  private async collectRescheduleSlots(
    locationId: string,
    items: CalendarRescheduleItem[],
    fromRaw: string,
    toRaw: string,
    manual: boolean,
  ): Promise<AvailableSlotsDayDto[]> {
    const { from, to } = this.manualSlotRange(fromRaw, toRaw);
    const location = await this.locationService.getBookingSettings(locationId);
    const now = new Date();
    const today = TimeUtils.zonedDateStr(now, location.timezone);
    const windowEnd = TimeUtils.addDaysStr(
      today,
      location.advanceBookingWindowDays - 1,
    );
    const first = from < today ? today : from;
    const last = !manual && to > windowEnd ? windowEnd : to;
    if (!items.length || first > last || hasStaffOverlap(items)) return [];
    const assignedStaff = await Promise.all(
      items.map((item) =>
        this.staff.resolveStaffForService(
          locationId,
          item.serviceId,
          item.staffId,
        ),
      ),
    );
    if (assignedStaff.some((candidates) => candidates.length === 0)) return [];
    const earliestStart = manual
      ? TimeUtils.localToUtc(`${today}T00:00:00`, location.timezone)
      : new Date(
          now.getTime() +
            Math.max(location.minimumBookingNoticeMinutes * 60_000, 1),
        );
    const spanDays = Math.ceil(
      (Math.max(...items.map((item) => item.endAt.getTime())) -
        Math.min(...items.map((item) => item.startAt.getTime()))) /
        86_400_000,
    );
    const staffIds = [...new Set(items.map((item) => item.staffId))];
    const [shifts, events] = await this.fetchSlotData(
      locationId,
      staffIds,
      TimeUtils.dateOnly(first),
      TimeUtils.dateOnly(TimeUtils.addDaysStr(last, spanDays)),
      items.flatMap((item) =>
        item.calendarEventId ? [item.calendarEventId] : [],
      ),
      location.timezone,
    );
    const dates = [
      ...new Set(shifts.map((shift) => TimeUtils.dateOnlyStr(shift.date))),
    ].sort();
    const shiftsByStaff = this.compute.groupShiftsByStaffDate(shifts);
    const blocked = this.compute.expandBlockEvents(
      events,
      dates,
      staffIds,
      location.timezone,
    );
    return dates
      .filter((date) => date >= first && date <= last)
      .flatMap((date) => {
        const slots = this.compute.collectRescheduleSlotsForDate(
          date,
          items,
          shiftsByStaff,
          blocked,
          earliestStart,
          location.slotIntervalMinutes,
          location.timezone,
        );
        return slots.length
          ? [
              {
                date,
                slots: slots.map((minute) => ({
                  time: TimeUtils.minutesToHHmm(minute),
                })),
              },
            ]
          : [];
      });
  }

  async filterAvailableStaff(
    locationId: string,
    candidates: { id: string }[],
    dateStr: string,
    startAt: Date,
    endAt: Date,
    timezone: string,
  ): Promise<{ id: string }[]> {
    if (!candidates.length) return [];
    const staffIds = candidates.map((c) => c.id);
    const date = new Date(dateStr);

    const [shifts, blockEvents] = await Promise.all([
      this.staff.listShiftsForStaff(staffIds, date, date),
      this.db.calendarEvent.findMany({
        where: blockingEventsWhere(locationId, staffIds, startAt, endAt),
        include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
      }),
    ]);

    const shiftsByStaff = new Map(shifts.map((s) => [s.staffId, s]));
    return candidates.filter((c) =>
      this.isSlotFree(
        c.id,
        dateStr,
        startAt,
        endAt,
        shiftsByStaff.get(c.id) ?? null,
        blockEvents,
        timezone,
      ),
    );
  }

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
    if (
      endAt <= startAt ||
      TimeUtils.zonedDateStr(startAt, timezone) !== dateStr
    )
      return false;
    const nextMidnight = TimeUtils.localToUtc(
      `${TimeUtils.addDaysStr(dateStr, 1)}T00:00:00`,
      timezone,
    );
    if (endAt > nextMidnight) return false;

    const slotStart = TimeUtils.dateToMinutes(startAt, timezone);
    const slotEnd =
      endAt.getTime() === nextMidnight.getTime()
        ? 1440
        : TimeUtils.dateToMinutes(endAt, timezone);

    if (
      slotStart < TimeUtils.timeToMinutes(shift.startTime) ||
      slotEnd > TimeUtils.timeToMinutes(shift.endTime)
    ) {
      return false;
    }

    const blocked =
      this.compute
        .expandBlockEvents(blockEvents, [dateStr], [staffId], timezone)
        .get(staffId)
        ?.get(dateStr) ?? [];

    return !blocked.some((b) => slotStart < b.end && slotEnd > b.start);
  }

  /**
   * `manual`: a request without services asks for free starts, see `resolveStartSelection`.
   * The public list always needs a service.
   */
  private async loadSlotCandidates(
    locationId: string,
    dto: AvailableSlotsRequestDto,
    manual = false,
  ) {
    const startOnly =
      manual && !dto.bundleId && !dto.serviceId && !dto.serviceIds?.length;
    const [business, selection] = await Promise.all([
      this.locationService.getBookingSettings(locationId),
      startOnly ? null : this.resolveSlotSelection(locationId, dto),
    ]);

    if (!business) throw new NotFoundException('Location not found');
    return {
      business,
      ...(selection ??
        (await this.resolveStartSelection(
          locationId,
          dto,
          business.slotIntervalMinutes,
        ))),
    };
  }

  /**
   * No service chosen yet: starts where the requested staff member, or anyone who performs
   * services, is free for one booking step. The visit length is not known, so this is only
   * a free start, not a fitting visit.
   */
  private async resolveStartSelection(
    locationId: string,
    dto: AvailableSlotsRequestDto,
    stepMinutes: number,
  ): Promise<CalendarSlotSelection> {
    if (dto.staffAssignments?.length) {
      throw new AppException(
        ErrorCode.BOOKING_STAFF_ASSIGNMENT_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    const directory = await this.staff.listActiveWithServices(locationId);
    const candidates = directory
      .filter((member) =>
        dto.staffId
          ? member.id === dto.staffId
          : member.staffServices.length > 0,
      )
      .map((member) => ({ id: member.id }));
    if (dto.staffId && candidates.length === 0) {
      throw new AppException(
        ErrorCode.BOOKING_STAFF_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      service: { durationMinutes: stepMinutes, bufferMinutes: 0 },
      candidateStaff: candidates,
      slotItems: [{ serviceId: START_ONLY_ITEM, durationMinutes: stepMinutes }],
      executionMode: 'SEQUENTIAL',
      candidatesByService: new Map([[START_ONLY_ITEM, candidates]]),
    };
  }

  private async resolveSlotSelection(
    locationId: string,
    dto: AvailableSlotsRequestDto,
  ): Promise<CalendarSlotSelection> {
    if (dto.bundleId && (dto.serviceIds?.length || dto.serviceId)) {
      throw new AppException(
        ErrorCode.BOOKING_SELECTION_CONFLICT,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.bundleId) {
      const bundle = await this.serviceCatalog.resolveBundleForAvailability(
        locationId,
        dto.bundleId,
      );
      const services = bundle.items.map((item) => item.service);
      const candidatesByService = await this.candidatesByService(
        locationId,
        services.map((service) => service.id),
        normalizeStaffAssignments(
          services.map((service) => service.id),
          bundle.executionMode,
          dto.staffId,
          dto.staffAssignments,
        ),
      );
      const candidateStaff = this.uniqueCandidates(candidatesByService);
      return {
        service: this.slotServiceDuration(
          services.map((service) => ({
            durationMinutes: service.durationMinutes,
            bufferMinutes: service.bufferMinutes,
          })),
          bundle.executionMode,
        ),
        candidateStaff,
        slotItems: services.map((service) => ({
          serviceId: service.id,
          durationMinutes: service.durationMinutes + service.bufferMinutes,
        })),
        executionMode: bundle.executionMode,
        candidatesByService,
      };
    }

    const serviceIds = dto.serviceIds?.length
      ? dto.serviceIds
      : dto.serviceId
        ? [dto.serviceId]
        : [];
    if (serviceIds.length === 0)
      throw new NotFoundException('Service not found');
    const ordered = await this.serviceCatalog.resolveServicesForAvailability(
      locationId,
      serviceIds,
    );
    const candidatesByService = await this.candidatesByService(
      locationId,
      serviceIds,
      normalizeStaffAssignments(
        serviceIds,
        'SEQUENTIAL',
        dto.staffId,
        dto.staffAssignments,
      ),
    );
    const staff = this.uniqueCandidates(candidatesByService);
    return {
      service: this.slotServiceDuration(ordered, 'SEQUENTIAL'),
      candidateStaff: staff,
      slotItems: ordered.map((service) => ({
        serviceId: service.id,
        durationMinutes: service.durationMinutes + service.bufferMinutes,
      })),
      executionMode: 'SEQUENTIAL',
      candidatesByService,
    };
  }

  private async candidatesByService(
    locationId: string,
    serviceIds: string[],
    requested: ReadonlyMap<string, string>,
  ): Promise<Map<string, CalendarSlotCandidate[]>> {
    const directory = await this.staff.listActiveWithServices(locationId);
    return new Map(
      [...new Set(serviceIds)].map((serviceId) => {
        const staffId = requested.get(serviceId);
        const candidates = directory
          .filter(
            (member) =>
              (!staffId || member.id === staffId) &&
              member.staffServices.some(
                (entry) => entry.serviceId === serviceId,
              ),
          )
          .map((member) => ({ id: member.id }));
        if (staffId && candidates.length === 0) {
          throw new AppException(
            ErrorCode.BOOKING_STAFF_NOT_FOUND,
            HttpStatus.NOT_FOUND,
          );
        }
        return [serviceId, candidates];
      }),
    );
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

  private slotServiceDuration(
    services: { durationMinutes: number; bufferMinutes: number }[],
    executionMode: string,
  ): { durationMinutes: number; bufferMinutes: number } {
    const minutes =
      executionMode === 'PARALLEL'
        ? Math.max(
            ...services.map(
              (service) => service.durationMinutes + service.bufferMinutes,
            ),
            0,
          )
        : services.reduce(
            (sum, service) =>
              sum + service.durationMinutes + service.bufferMinutes,
            0,
          );
    return { durationMinutes: minutes, bufferMinutes: 0 };
  }

  private manualSlotRange(
    fromRaw: string,
    toRaw: string,
  ): { from: string; to: string } {
    const from = fromRaw.slice(0, 10);
    const to = toRaw.slice(0, 10);
    const span =
      (TimeUtils.dateOnly(to).getTime() - TimeUtils.dateOnly(from).getTime()) /
        86_400_000 +
      1;
    if (span > MANUAL_AVAILABLE_SLOTS_MAX_DAYS) {
      throw new AppException(
        ErrorCode.BOOKING_SLOT_RANGE_TOO_LONG,
        HttpStatus.BAD_REQUEST,
      );
    }
    return { from, to };
  }

  private async collectSlotDays(input: {
    locationId: string;
    timezone: string;
    slotIntervalMinutes: number;
    service: { durationMinutes: number; bufferMinutes: number };
    candidateStaff: { id: string }[];
    slotItems: CalendarSlotItem[];
    executionMode: string;
    candidatesByService: Map<string, CalendarSlotCandidate[]>;
    todayStr: string;
    earliestMinuteToday: number;
    rangeStart: Date;
    rangeEnd: Date;
    excludedCalendarEventIds?: string[];
  }): Promise<AvailableSlotsDayDto[]> {
    const window = await this.loadSlotWindow(input);
    const slotDuration =
      input.service.durationMinutes + input.service.bufferMinutes;

    return window.dates.flatMap((date) => {
      const earliestMinute =
        date === input.todayStr ? input.earliestMinuteToday : 0;
      const slots =
        input.slotItems.length === 1
          ? this.compute.collectSlotsForDate(
              date,
              input.candidateStaff,
              window.shiftsByStaffDate,
              window.blockedByStaffDate,
              earliestMinute,
              slotDuration,
              input.slotIntervalMinutes,
            )
          : this.compute.collectMultiServiceSlotsForDate(
              date,
              input.slotItems,
              input.executionMode,
              input.candidatesByService,
              window.shiftsByStaffDate,
              window.blockedByStaffDate,
              earliestMinute,
              input.slotIntervalMinutes,
            );
      return slots.length
        ? [
            {
              date,
              slots: slots.map((start) => ({
                time: TimeUtils.minutesToHHmm(start),
              })),
            },
          ]
        : [];
    });
  }

  /** Shifts and blocks of the candidates over the range, indexed for slot generation. */
  private async loadSlotWindow(input: {
    locationId: string;
    timezone: string;
    candidateStaff: { id: string }[];
    rangeStart: Date;
    rangeEnd: Date;
    excludedCalendarEventIds?: string[];
  }) {
    const staffIds = input.candidateStaff.map((staff) => staff.id);
    const [shifts, blockEvents] = await this.fetchSlotData(
      input.locationId,
      staffIds,
      input.rangeStart,
      input.rangeEnd,
      input.excludedCalendarEventIds ?? [],
      input.timezone,
    );
    const dates = [
      ...new Set(shifts.map((shift) => TimeUtils.dateOnlyStr(shift.date))),
    ].sort();
    return {
      dates,
      shiftsByStaffDate: this.compute.groupShiftsByStaffDate(shifts),
      blockedByStaffDate: this.compute.expandBlockEvents(
        blockEvents,
        dates,
        staffIds,
        input.timezone,
      ),
    };
  }

  private resolveBookingWindow(business: {
    timezone: string;
    advanceBookingWindowDays: number;
  }) {
    const nowParts = TimeUtils.toZonedParts(new Date(), business.timezone);
    const todayStr = TimeUtils.zonedDateStr(new Date(), business.timezone);
    const endStr = TimeUtils.addDaysStr(
      todayStr,
      business.advanceBookingWindowDays - 1,
    );
    return {
      todayStr,
      nowMinutes: nowParts.hour * 60 + nowParts.minute,
      rangeStart: new Date(todayStr),
      rangeEnd: new Date(endStr),
    };
  }

  private fetchSlotData(
    locationId: string,
    staffIds: string[],
    rangeStart: Date,
    rangeEnd: Date,
    excludedCalendarEventIds: string[],
    timezone: string,
  ) {
    const windowStart = TimeUtils.localToUtc(
      `${TimeUtils.dateOnlyStr(rangeStart)}T00:00:00`,
      timezone,
    );
    const windowEnd = TimeUtils.localToUtc(
      `${TimeUtils.addDaysStr(TimeUtils.dateOnlyStr(rangeEnd), 1)}T00:00:00`,
      timezone,
    );
    return Promise.all([
      this.staff.listShiftsForAvailability(
        locationId,
        staffIds,
        rangeStart,
        rangeEnd,
      ),
      this.db.calendarEvent.findMany({
        where: blockingEventsWhere(
          locationId,
          staffIds,
          windowStart,
          windowEnd,
          excludedCalendarEventIds,
        ),
        include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
      }),
    ]);
  }
}
