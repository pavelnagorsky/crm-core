import { createHash } from 'crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  Booking,
  CalendarEventRepeatType,
  CalendarEventType,
  ServiceStatus,
} from '@prisma/client';
import { BookingVisibility } from '../business/enums/booking-visibility.enum.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { MoneyService } from '../../shared/money/money.service.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { ClientsService } from '../clients/clients.service.js';
import { StaffService } from '../staff/staff.service.js';
import { TimeService } from '../time/time.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';
import { BookingSource } from './enums/booking-source.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { NOTIFICATION_EVENT } from '../notifications/notifications.service.js';
import { BookingConfirmedNotification } from '../notifications/notifications/booking-confirmed.notification.js';
import { BookingClientService } from './booking-client.service.js';

@Injectable()
export class BookingCreateService {
  private readonly logger = new Logger(BookingCreateService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly calendarService: CalendarService,
    private readonly clientsService: ClientsService,
    private readonly staffService: StaffService,
    private readonly eventEmitter: EventEmitter2,
    private readonly bookingClientService: BookingClientService,
  ) {}

  async createPublicBooking(
    businessId: string,
    dto: CreateBookingDto,
  ): Promise<Booking> {
    const { booking, timezone, currency } = await this.create(businessId, BookingSource.PUBLIC_PAGE, dto);
    this.logger.log(`booking created (public): id=${booking.id} businessId=${businessId} serviceId=${booking.serviceId} staffId=${booking.staffId} startAt=${booking.startAt.toISOString()}`);
    // Public bookings have no authenticated user — the client is the actor
    const actor: AuditActor = {
      name: `${booking.clientFirstName} ${booking.clientLastName}`,
      role: AuditActorRole.CLIENT,
    };
    this.emitBookingCreated(booking, actor, currency);
    this.emitBookingNotification(booking, timezone);
    return booking;
  }

  async createManualBooking(
    businessId: string,
    dto: ManualCreateBookingDto,
    actor: AuditActor,
  ): Promise<Booking> {
    const { booking, timezone, currency } = await this.create(businessId, BookingSource.MANUAL, dto, dto.customPrice);
    this.logger.log(`booking created (manual): id=${booking.id} businessId=${businessId} serviceId=${booking.serviceId} staffId=${booking.staffId} startAt=${booking.startAt.toISOString()} actor=${actor.name}`);
    this.emitBookingCreated(booking, actor, currency);
    this.emitBookingNotification(booking, timezone);
    return booking;
  }

  // ── Core ───────────────────────────────────────────────────────────────────────

  private async create(
    businessId: string,
    source: BookingSource,
    dto: CreateBookingDto,
    customPrice?: string,
  ): Promise<{ booking: Booking; timezone: string; currency: string }> {
    const [business, service] = await Promise.all([
      this.db.business.findUnique({
        where: { id: businessId },
        select: { isBookingConfirmationRequired: true, timezone: true, bookingVisibility: true, currency: true },
      }),
      this.db.service.findFirst({
        where: { id: dto.serviceId, businessId, status: ServiceStatus.ACTIVE },
        select: { id: true, title: true, durationMinutes: true, price: true },
      }),
    ]);

    if (!business)
      throw new AppException(
        ErrorCode.BOOKING_BUSINESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (source === BookingSource.PUBLIC_PAGE && business.bookingVisibility === BookingVisibility.PRIVATE)
      throw new AppException(ErrorCode.BOOKING_NOT_AVAILABLE, HttpStatus.FORBIDDEN);
    if (!service)
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );

    const startAt = TimeService.localToUtc(dto.startAt, business.timezone);
    const endAt = new Date(
      startAt.getTime() + service.durationMinutes * 60_000,
    );
    const dateStr = TimeService.zonedDateStr(startAt, business.timezone);

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

    const booking = await this.db.$transaction(async (tx) => {
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
        this.logger.warn(`slot unavailable: businessId=${businessId} staffId=${staffId} startAt=${startAt.toISOString()} endAt=${endAt.toISOString()}`);
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
    return { booking, timezone: business.timezone, currency: business.currency };
  }

  // ── Audit ───────────────────────────────────────────────────────────────────────

  private emitBookingCreated(booking: Booking, actor: AuditActor, currency: string): void {
    const event: AuditLogEvent = {
      businessId: booking.businessId,
      entityType: AuditEntity.BOOKING,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: {
        serviceName: booking.serviceTitle,
        staffName: booking.staffName,
        startTime: booking.startAt.toISOString(),
        endTime: booking.endAt.toISOString(),
        price: MoneyService.format(booking.customPrice ?? booking.servicePrice),
        currency,
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  private emitBookingNotification(booking: Booking, timezone: string): void {
    if (!booking.clientEmail) return;
    const clientToken = this.bookingClientService.generateClientToken(booking.id);
    this.eventEmitter.emit(NOTIFICATION_EVENT, new BookingConfirmedNotification({
      id: booking.id,
      clientEmail: booking.clientEmail,
      clientFirstName: booking.clientFirstName,
      clientLastName: booking.clientLastName,
      serviceTitle: booking.serviceTitle,
      staffName: booking.staffName,
      startAt: booking.startAt,
      endAt: booking.endAt,
      timezone,
    }, clientToken));
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
    const dayStart = TimeService.localToUtc(`${dateStr}T00:00:00`, timezone);
    const dayEnd = TimeService.addDaysInTz(dayStart, 1, timezone);

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
          startAt: { gte: dayStart, lt: dayEnd },
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
