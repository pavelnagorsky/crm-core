import { createHash } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Booking,
  CalendarEventRepeatType,
  CalendarEventType,
} from '@prisma/client';
import { format } from 'date-fns';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { ClientsService } from '../clients/clients.service.js';
import { StaffService } from '../staff/staff.service.js';
import { TimeService } from '../time/time.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';
import { BookingSource } from './enums/booking-source.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';

@Injectable()
export class BookingCreateService {
  constructor(
    private readonly db: DatabaseService,
    private readonly time: TimeService,
    private readonly calendarService: CalendarService,
    private readonly clientsService: ClientsService,
    private readonly staffService: StaffService,
  ) {}

  createPublicBooking(
    businessId: string,
    dto: CreateBookingDto,
  ): Promise<Booking> {
    return this.create(businessId, BookingSource.PUBLIC_PAGE, dto);
  }

  createManualBooking(
    businessId: string,
    dto: ManualCreateBookingDto,
  ): Promise<Booking> {
    return this.create(businessId, BookingSource.MANUAL, dto, dto.customPrice);
  }

  // ── Core ───────────────────────────────────────────────────────────────────────

  private async create(
    businessId: string,
    source: BookingSource,
    dto: CreateBookingDto,
    customPrice?: string,
  ): Promise<Booking> {
    const [business, service] = await Promise.all([
      this.db.business.findUnique({
        where: { id: businessId },
        select: { isBookingConfirmationRequired: true, timezone: true },
      }),
      this.db.service.findFirst({
        where: { id: dto.serviceId, businessId, isActive: true },
        select: { id: true, title: true, durationMinutes: true, price: true },
      }),
    ]);

    if (!business)
      throw new AppException(
        ErrorCode.BOOKING_BUSINESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (!service)
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );

    const startAt = this.time.localToUtc(dto.startAt, business.timezone);
    const endAt = new Date(
      startAt.getTime() + service.durationMinutes * 60_000,
    );
    const dateStr = format(startAt, 'yyyy-MM-dd');

    const [client, staffId] = await Promise.all([
      this.clientsService.resolveForBooking(
        businessId,
        dto.phone,
        dto.firstName,
        dto.lastName,
        dto.email,
      ),
      this.resolveStaff(
        businessId,
        dto.serviceId,
        dto.staffId,
        dateStr,
        startAt,
        endAt,
        business.timezone,
      ),
    ]);

    const staff = await this.staffService.findById(staffId);

    const status = business.isBookingConfirmationRequired
      ? BookingStatus.PENDING
      : BookingStatus.CONFIRMED;

    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${this.buildLockKey(staffId, dateStr)})`;

      const [shift, blockEvents] = await Promise.all([
        tx.staffShift.findFirst({
          where: { staffId, date: new Date(dateStr) },
        }),
        tx.calendarEvent.findMany({
          where: {
            businessId,
            OR: [{ staffId: null }, { staffId }],
            repeatType: CalendarEventRepeatType.NONE,
            startDateTime: { lte: endAt },
            endDateTime: { gte: startAt },
          },
          include: {
            cancelledOccurrences: { select: { occurrenceDate: true } },
          },
        }),
      ]);

      // Re-check inside the transaction using tx-fetched data — calendarService.isSlotFree is a
      // pure computation method; fetching via tx here is required to hold the advisory lock scope.
      if (
        !this.calendarService.isSlotFree(
          staffId,
          dateStr,
          startAt,
          endAt,
          shift,
          blockEvents,
          business.timezone,
        )
      ) {
        throw new AppException(
          ErrorCode.BOOKING_SLOT_UNAVAILABLE,
          HttpStatus.CONFLICT,
        );
      }

      const calendarEvent = await tx.calendarEvent.create({
        data: {
          businessId,
          staffId,
          type: CalendarEventType.BLOCK,
          repeatType: CalendarEventRepeatType.NONE,
          startDateTime: startAt,
          endDateTime: endAt,
        },
      });

      return tx.booking.create({
        data: {
          businessId,
          staffId,
          serviceId: dto.serviceId,
          clientId: client.id,
          startAt,
          endAt,
          status,
          source,
          clientFirstName: client.firstName,
          clientLastName: client.lastName,
          clientPhone: client.phone,
          clientEmail: client.email ?? null,
          serviceTitle: service.title,
          serviceDuration: service.durationMinutes,
          servicePrice: service.price,
          customPrice: customPrice ?? null,
          staffName: staff.name,
          calendarEventId: calendarEvent.id,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  // ── Staff resolution ────────────────────────────────────────────────────────────

  private async resolveStaff(
    businessId: string,
    serviceId: string,
    requestedStaffId: string | undefined,
    dateStr: string,
    startAt: Date,
    endAt: Date,
    timezone: string,
  ): Promise<string> {
    const candidates = await this.staffService.resolveStaffForService(
      businessId,
      serviceId,
      requestedStaffId,
    );

    if (requestedStaffId) {
      if (candidates.length === 0)
        throw new AppException(
          ErrorCode.BOOKING_STAFF_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      return candidates[0].id;
    }

    if (candidates.length === 0)
      throw new AppException(
        ErrorCode.BOOKING_NO_STAFF_AVAILABLE,
        HttpStatus.CONFLICT,
      );

    const staffIds = candidates.map((s) => s.id);
    const date = new Date(dateStr);

    const [available, bookingCounts] = await Promise.all([
      this.calendarService.filterAvailableStaff(
        businessId,
        candidates,
        dateStr,
        startAt,
        endAt,
        timezone,
      ),
      this.db.booking.groupBy({
        by: ['staffId'],
        where: {
          staffId: { in: staffIds },
          startAt: { gte: date, lt: new Date(date.getTime() + 86_400_000) },
        },
        _count: { id: true },
      }),
    ]);

    if (available.length === 0)
      throw new AppException(
        ErrorCode.BOOKING_NO_STAFF_AVAILABLE,
        HttpStatus.CONFLICT,
      );

    const countByStaff = new Map(
      bookingCounts.map((r) => [r.staffId, r._count.id]),
    );
    available.sort(
      (a, b) => (countByStaff.get(a.id) ?? 0) - (countByStaff.get(b.id) ?? 0),
    );
    return available[0].id;
  }

  // ── Advisory lock key ───────────────────────────────────────────────────────────

  private buildLockKey(staffId: string, dateStr: string): bigint {
    const hash = createHash('sha256').update(`${staffId}:${dateStr}`).digest();
    // Read first 8 bytes as a signed int64 (what pg_advisory_xact_lock expects)
    return hash.readBigInt64BE(0);
  }
}
