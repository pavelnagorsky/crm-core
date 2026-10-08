import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingVisibility,
  CalendarEventRepeatType,
} from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { TimeService } from '../../../../shared/time/time.service.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { DatabaseService } from '../../../../database/database.service.js';
import { LocationService } from '../../../location/location.service.js';
import { ServiceBundleService } from '../../../services/catalog/service-bundle.service.js';
import { ServicesService } from '../../../services/services.service.js';
import { StaffService } from '../../../staff/staff.service.js';
import { AvailableSlotsDayDto } from '../../dto/available-slots-day.dto.js';
import { AvailableSlotsRequestDto } from '../../dto/available-slots-request.dto.js';
import { ManualAvailableSlotsRequestDto } from '../../dto/manual-available-slots-request.dto.js';
import { CalendarSlotCandidate } from '../../interfaces/calendar-slot-candidate.interface.js';
import { CalendarSlotItem } from '../../interfaces/calendar-slot-item.interface.js';
import { CalendarEventWithCancellations } from '../../interfaces/calendar-types.interface.js';
import { CalendarComputeService } from '../calendar-compute.service.js';

const MANUAL_AVAILABLE_SLOTS_MAX_DAYS = 62;

@Injectable()
export class CalendarAvailabilityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly staff: StaffService,
    private readonly locationService: LocationService,
    private readonly services: ServicesService,
    private readonly bundles: ServiceBundleService,
    private readonly compute: CalendarComputeService,
  ) {}

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
    if (business.bookingVisibility === BookingVisibility.PRIVATE) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_AVAILABLE,
        HttpStatus.FORBIDDEN,
      );
    }
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
    if (serviceIds.length === 0) throw new NotFoundException('Service not found');
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
}
