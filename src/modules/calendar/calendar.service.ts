import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingVisibility,
  CalendarEvent,
  CalendarEventRepeatType,
  CalendarEventType,
  Prisma,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { DatabaseService } from '../../database/database.service.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { TimeService } from '../../shared/time/time.service.js';
import { LocationService } from '../location/location.service.js';
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
import { ManualAvailableSlotsRequestDto } from './dto/manual-available-slots-request.dto.js';
import { MoveCalendarEventDto } from './dto/move-calendar-event.dto.js';
import { CalendarEventItemDto } from './dto/calendar-event-item.dto.js';
import { CalendarSlotCandidate } from './interfaces/calendar-slot-candidate.interface.js';
import { CalendarSlotItem } from './interfaces/calendar-slot-item.interface.js';
import { CalendarBookingFeed } from './interfaces/calendar-booking-feed.interface.js';
import { ServicesService } from '../services/services.service.js';
import { ServiceBundleService } from '../services/service-bundle.service.js';
import { BookingCalendarEventInput } from './interfaces/booking-calendar-event-input.interface.js';

const MANUAL_AVAILABLE_SLOTS_MAX_DAYS = 62;

@Injectable()
export class CalendarService {
  constructor(
    private readonly db: DatabaseService,
    private readonly staff: StaffService,
    private readonly locationService: LocationService,
    private readonly services: ServicesService,
    private readonly bundles: ServiceBundleService,
    private readonly compute: CalendarComputeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    locationId: string,
    dto: CreateCalendarEventDto,
    actor: AuditActor,
  ): Promise<CalendarEvent[]> {
    const staffIds = dto.staffIds?.length ? dto.staffIds : [null];
    const events = await this.db.$transaction(
      staffIds.map((staffId) =>
        this.db.calendarEvent.create({
          data: this.buildEventData(locationId, dto, staffId),
        }),
      ),
    );

    for (const event of events) {
      if (!event.staffId) continue;
      const audit: AuditLogEvent = {
        locationId,
        entityType: AuditEntity.STAFF,
        entityId: event.staffId,
        eventType: AuditEvent.STAFF_BLOCK_CREATED,
        actionType: AuditActionType.CREATE,
        occurredAt: new Date(),
        actor,
        payload: {
          startDateTime: dto.startDateTime,
          endDateTime: dto.endDateTime,
          title: dto.title ?? null,
          reason: dto.reason ?? null,
        },
      };
      this.eventEmitter.emit(AUDIT_EVENT, audit);
    }

    return events;
  }

  async update(
    locationId: string,
    eventId: string,
    dto: UpdateCalendarEventDto,
  ): Promise<CalendarEvent> {
    const event = await this.findInLocation(locationId, eventId);
    if (!dto.thisOnly) {
      return this.db.calendarEvent.update({
        where: { id: eventId },
        data: this.buildEventData(
          event.locationId,
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
        data: {
          ...this.buildEventData(
            event.locationId,
            dto,
            dto.staffId !== undefined ? dto.staffId : event.staffId,
          ),
          repeatType: CalendarEventRepeatType.NONE,
          daysMask: null,
          repeatUntil: null,
        },
      });
    });
  }

  async delete(
    locationId: string,
    eventId: string,
    dto: DeleteCalendarEventDto,
  ): Promise<void> {
    await this.findInLocation(locationId, eventId);
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

  async findInLocation(
    locationId: string,
    eventId: string,
  ): Promise<CalendarEvent> {
    const event = await this.db.calendarEvent.findFirst({
      where: { id: eventId, locationId },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    return event;
  }

  listBlockingEvents(
    locationId: string,
    staffIds: string[],
    startAt: Date,
    endAt: Date,
    excludedEventIds: string[] = [],
    tx?: Prisma.TransactionClient,
  ): Promise<CalendarEventWithCancellations[]> {
    return (tx ?? this.db).calendarEvent.findMany({
      where: {
        locationId,
        OR: [{ staffId: null }, { staffId: { in: staffIds } }],
        repeatType: CalendarEventRepeatType.NONE,
        startDateTime: { lte: endAt },
        endDateTime: { gte: startAt },
        ...(excludedEventIds.length ? { id: { notIn: excludedEventIds } } : {}),
      },
      include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
    });
  }

  createBookingEvent(
    input: BookingCalendarEventInput,
    tx: Prisma.TransactionClient,
  ): Promise<CalendarEvent> {
    return tx.calendarEvent.create({
      data: {
        locationId: input.locationId,
        staffId: input.staffId,
        type: CalendarEventType.BOOKING,
        repeatType: CalendarEventRepeatType.NONE,
        startDateTime: input.startAt,
        endDateTime: input.endAt,
      },
    });
  }

  async saveBookingEvent(
    input: BookingCalendarEventInput,
    tx: Prisma.TransactionClient,
  ): Promise<CalendarEvent> {
    if (!input.eventId) return this.createBookingEvent(input, tx);
    return tx.calendarEvent.update({
      where: { id: input.eventId },
      data: {
        staffId: input.staffId,
        startDateTime: input.startAt,
        endDateTime: input.endAt,
      },
    });
  }

  async deleteBookingEvents(
    eventIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (eventIds.length === 0) return;
    await tx.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
  }

  async moveOccurrence(
    locationId: string,
    eventId: string,
    dto: MoveCalendarEventDto,
  ): Promise<CalendarEvent> {
    const event = await this.findInLocation(locationId, eventId);
    const startDateTime = new Date(dto.startDateTime);
    const endDateTime = new Date(dto.endDateTime);
    if (!dto.thisOnly) {
      return this.db.calendarEvent.update({
        where: { id: eventId },
        data: { startDateTime, endDateTime },
      });
    }
    const occurrenceDate = new Date(dto.occurrenceDate!);
    return this.db.$transaction(async (tx) => {
      await tx.calendarEventCancelledOccurrence.upsert({
        where: { eventId_occurrenceDate: { eventId, occurrenceDate } },
        create: { eventId, occurrenceDate },
        update: {},
      });
      return tx.calendarEvent.create({
        data: {
          locationId: event.locationId,
          staffId: event.staffId,
          type: CalendarEventType.BLOCK,
          reason: event.reason,
          title: event.title,
          notes: event.notes,
          repeatType: CalendarEventRepeatType.NONE,
          startDateTime,
          endDateTime,
          daysMask: null,
          repeatUntil: null,
        },
      });
    });
  }

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
    // One day of slack on each side: event instants are UTC, the window is a business-local date.
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

  async getAvailableSlots(
    locationId: string,
    dto: AvailableSlotsRequestDto,
  ): Promise<AvailableSlotsDayDto[]> {
    const {
      business,
      service,
      candidateStaff,
      slotItems,
      executionMode,
      candidatesByService,
    } = await this.loadSlotCandidates(locationId, dto);
    if (business.bookingVisibility === BookingVisibility.PRIVATE)
      throw new AppException(
        ErrorCode.BOOKING_NOT_AVAILABLE,
        HttpStatus.FORBIDDEN,
      );
    if (candidateStaff.length === 0) return [];

    const { todayStr, nowMinutes, rangeStart, rangeEnd } =
      this.resolveBookingWindow(business);
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
      earliestMinuteToday: nowMinutes + business.minimumBookingNoticeMinutes,
      rangeStart,
      rangeEnd,
    });
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
    } = await this.loadSlotCandidates(locationId, dto);
    if (candidateStaff.length === 0) return [];

    const todayStr = TimeService.zonedDateStr(new Date(), business.timezone);
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
      rangeStart: TimeService.dateOnly(effectiveFrom),
      rangeEnd: new Date(`${to}T23:59:59.999Z`),
      excludedCalendarEventIds,
    });
  }

  /**
   * Returns the subset of `candidates` who have a shift covering [startAt, endAt)
   * and no blocking calendar events on that slot.
   */
  async filterAvailableStaff(
    locationId: string,
    candidates: { id: string }[],
    dateStr: string,
    startAt: Date,
    endAt: Date,
    timezone: string,
  ): Promise<{ id: string }[]> {
    const staffIds = candidates.map((c) => c.id);
    const date = new Date(dateStr);

    const [shifts, blockEvents] = await Promise.all([
      this.staff.listShiftsForStaff(staffIds, date, date),
      this.db.calendarEvent.findMany({
        where: {
          locationId,
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

    const slotStart = TimeService.dateToMinutes(startAt, timezone);
    const slotEnd = TimeService.dateToMinutes(endAt, timezone);

    if (
      slotStart < TimeService.timeToMinutes(shift.startTime) ||
      slotEnd > TimeService.timeToMinutes(shift.endTime)
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

  private async loadSlotCandidates(
    locationId: string,
    dto: AvailableSlotsRequestDto,
  ) {
    const [business, selection] = await Promise.all([
      this.locationService.findById(locationId),
      this.resolveSlotSelection(locationId, dto),
    ]);

    if (!business) throw new NotFoundException('Location not found');
    return { business, ...selection };
  }

  private async resolveSlotSelection(
    locationId: string,
    dto: AvailableSlotsRequestDto,
  ): Promise<{
    service: { durationMinutes: number; bufferMinutes: number };
    candidateStaff: CalendarSlotCandidate[];
    slotItems: CalendarSlotItem[];
    executionMode: string;
    candidatesByService: Map<string, CalendarSlotCandidate[]>;
  }> {
    if (dto.bundleId && (dto.serviceIds?.length || dto.serviceId)) {
      throw new AppException(
        ErrorCode.BOOKING_SELECTION_CONFLICT,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.bundleId) {
      const bundle = await this.bundles.resolveActiveForBooking(
        locationId,
        dto.bundleId,
      );
      const services = bundle.items.map((item) => item.service);
      const candidatesByService = await this.candidatesByService(
        locationId,
        services.map((service) => service.id),
        dto.staffId,
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
    const ordered = await this.services.resolveActiveForBooking(
      locationId,
      serviceIds,
    );
    const candidatesByService = await this.candidatesByService(
      locationId,
      serviceIds,
      dto.staffId,
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
    staffId?: string,
  ): Promise<Map<string, CalendarSlotCandidate[]>> {
    const map = new Map<string, CalendarSlotCandidate[]>();
    for (const serviceId of new Set(serviceIds)) {
      map.set(
        serviceId,
        await this.staff.resolveStaffForService(locationId, serviceId, staffId),
      );
    }
    return map;
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
      (TimeService.dateOnly(to).getTime() -
        TimeService.dateOnly(from).getTime()) /
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
    const staffIds = input.candidateStaff.map((staff) => staff.id);
    const [shifts, blockEvents] = await this.fetchSlotData(
      input.locationId,
      staffIds,
      input.rangeStart,
      input.rangeEnd,
      input.excludedCalendarEventIds ?? [],
    );

    const dates = [
      ...new Set(shifts.map((shift) => TimeService.dateOnlyStr(shift.date))),
    ].sort();
    const shiftsByStaffDate = this.compute.groupShiftsByStaffDate(shifts);
    const blockedByStaffDate = this.compute.expandBlockEvents(
      blockEvents,
      dates,
      staffIds,
      input.timezone,
    );
    const slotDuration =
      input.service.durationMinutes + input.service.bufferMinutes;

    return dates.flatMap((date) => {
      const earliestMinute =
        date === input.todayStr ? input.earliestMinuteToday : 0;
      const slots =
        input.slotItems.length === 1
          ? this.compute.collectSlotsForDate(
              date,
              input.candidateStaff,
              shiftsByStaffDate,
              blockedByStaffDate,
              earliestMinute,
              slotDuration,
              input.slotIntervalMinutes,
            )
          : this.compute.collectMultiServiceSlotsForDate(
              date,
              input.slotItems,
              input.executionMode,
              input.candidatesByService,
              shiftsByStaffDate,
              blockedByStaffDate,
              earliestMinute,
              input.slotIntervalMinutes,
            );
      return slots.length
        ? [
            {
              date,
              slots: slots.map((start) => ({
                time: TimeService.minutesToHHmm(start),
              })),
            },
          ]
        : [];
    });
  }

  private resolveBookingWindow(business: {
    timezone: string;
    advanceBookingWindowDays: number;
  }) {
    const nowParts = TimeService.toZonedParts(new Date(), business.timezone);
    const todayStr = TimeService.zonedDateStr(new Date(), business.timezone);
    const endStr = TimeService.addDaysStr(
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
    excludedCalendarEventIds: string[] = [],
  ) {
    return Promise.all([
      this.staff.listShiftsForStaff(staffIds, rangeStart, rangeEnd),
      this.db.calendarEvent.findMany({
        where: {
          locationId,
          AND: [
            ...(excludedCalendarEventIds.length
              ? [{ id: { notIn: excludedCalendarEventIds } }]
              : []),
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
    locationId: string,
    dto: CreateCalendarEventDto | UpdateCalendarEventDto,
    staffId?: string | null,
  ): Prisma.CalendarEventUncheckedCreateInput {
    return {
      locationId,
      staffId: staffId ?? null,
      type: CalendarEventType.BLOCK,
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
