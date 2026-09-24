import { createHash } from 'crypto';
import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Booking, BusinessRole, CalendarEventRepeatType, CalendarEventType, CancelledBy, Prisma, ServiceStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { TimeService } from '../time/time.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { StaffService } from '../staff/staff.service.js';
import { StaffEarningsService } from '../payroll/earnings/staff-earnings.service.js';
import { BusinessService } from '../business/business.service.js';
import { BookingSetupCategoryDto } from './dto/booking-setup-category.dto.js';
import { BookingSetupResponseDto } from './dto/booking-setup-response.dto.js';
import { BookingSetupStaffDto } from './dto/booking-setup-staff.dto.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { UpdateBookingDto } from './dto/update-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSearchOrderBy } from './enums/booking-search-order-by.enum.js';
import { AUTO_COMPLETABLE_STATUSES } from './booking-cron.rules.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { diffFields } from '../audit/utils/diff-fields.js';
import { BOOKING_AUDIT_FIELDS } from '../audit/fields/booking.fields.js';
import { TokenPayloadDto, assertBusinessRole } from '../auth/dto/token-payload.dto.js';
import { NOTIFICATION_EVENT } from '../notifications/notifications.service.js';
import { BookingStatusChangedNotification } from '../notifications/notifications/booking-status-changed.notification.js';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly time: TimeService,
    private readonly calendarService: CalendarService,
    private readonly staffService: StaffService,
    private readonly businessService: BusinessService,
    private readonly staffEarnings: StaffEarningsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getBookingSetup(businessId: string): Promise<BookingSetupResponseDto> {
    const servicesOrder = [{ sortOrder: 'asc' as const }, { title: 'asc' as const }];

    const [[categories, uncategorized], staff] = await Promise.all([
      this.db.$transaction([
        this.db.serviceCategory.findMany({
          where: { businessId },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: { services: { where: { status: ServiceStatus.ACTIVE }, orderBy: servicesOrder } },
        }),
        this.db.service.findMany({
          where: { businessId, categoryId: null, status: ServiceStatus.ACTIVE },
          orderBy: servicesOrder,
        }),
      ]),
      this.staffService.listActiveWithServices(businessId),
    ]);

    const result = categories.map(BookingSetupCategoryDto.fromEntity);
    if (uncategorized.length) result.push(BookingSetupCategoryDto.uncategorized(uncategorized));

    return {
      categories: result,
      staff: staff.map(BookingSetupStaffDto.fromEntity),
    };
  }

  async update(bookingId: string, tokenPayload: TokenPayloadDto, dto: UpdateBookingDto): Promise<Booking> {
    const old = await this.findById(bookingId);
    assertBusinessRole(tokenPayload, old.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const { businessId } = old;
    const actor = auditActorFromToken(tokenPayload, businessId);

    const slotChanging = dto.startAt !== undefined || dto.staffId !== undefined || dto.serviceId !== undefined;

    const updated = slotChanging
      ? await this.updateWithSlotReschedule(old, businessId, dto)
      : await this.db.booking.update({
          where: { id: bookingId },
          data: {
            clientFirstName: dto.firstName ?? old.clientFirstName,
            clientLastName: dto.lastName ?? old.clientLastName,
            clientPhone: dto.phone ?? old.clientPhone,
            clientEmail: dto.email !== undefined ? (dto.email ?? null) : old.clientEmail,
            customPrice: dto.customPrice !== undefined ? dto.customPrice : undefined,
            notes: dto.notes !== undefined ? (dto.notes ?? null) : undefined,
            internalNotes: dto.internalNotes !== undefined ? (dto.internalNotes ?? null) : undefined,
          },
        });

    const changes = diffFields(old, updated, BOOKING_AUDIT_FIELDS);
    if (changes.length > 0) {
      this.emitAudit({
        businessId,
        entityId: bookingId,
        eventType: AuditEvent.BOOKING_UPDATED,
        actionType: AuditActionType.MODIFY,
        actor,
        payload: { changes },
      });
    }

    return updated;
  }

  async updateStatus(bookingId: string, tokenPayload: TokenPayloadDto, dto: UpdateBookingStatusDto): Promise<Booking> {
    const old = await this.findById(bookingId);
    assertBusinessRole(tokenPayload, old.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const updated = await this.db.booking.update({ where: { id: bookingId }, data: { status: dto.status } });
    const actor = auditActorFromToken(tokenPayload, old.businessId);
    if (dto.status === BookingStatus.COMPLETED && old.status !== BookingStatus.COMPLETED) {
      await this.staffEarnings.recordForCompletedBooking(updated);
    } else if (old.status === BookingStatus.COMPLETED && dto.status !== BookingStatus.COMPLETED) {
      await this.staffEarnings.reverseForBooking(updated, actor);
    }
    this.emitAudit({
      businessId: old.businessId,
      entityId: bookingId,
      eventType: AuditEvent.BOOKING_STATUS_CHANGED,
      actionType: AuditActionType.MODIFY,
      actor,
      payload: { from: old.status, to: dto.status },
    });
    if (dto.status === BookingStatus.CONFIRMED && old.clientEmail) {
      const { timezone } = await this.businessService.getLocale(old.businessId);
      this.eventEmitter.emit(NOTIFICATION_EVENT, new BookingStatusChangedNotification(
        { ...old, clientEmail: old.clientEmail, timezone },
        'CONFIRMED',
        undefined,
      ));
    }
    return updated;
  }

  async completeElapsed(now = new Date()): Promise<number> {
    const due = await this.db.booking.findMany({
      where: {
        endAt: { lte: now },
        status: { in: [...AUTO_COMPLETABLE_STATUSES] },
        deletedAt: null,
      },
    });

    let completed = 0;
    const actor: AuditActor = { name: 'System', role: AuditActorRole.SYSTEM };

    for (const booking of due) {
      const { count } = await this.db.booking.updateMany({
        where: {
          id: booking.id,
          status: { in: [...AUTO_COMPLETABLE_STATUSES] },
          deletedAt: null,
        },
        data: { status: BookingStatus.COMPLETED },
      });
      if (count === 0) continue;

      const updated = { ...booking, status: BookingStatus.COMPLETED };
      await this.staffEarnings.recordForCompletedBooking(updated);
      this.emitAudit({
        businessId: booking.businessId,
        entityId: booking.id,
        eventType: AuditEvent.BOOKING_STATUS_CHANGED,
        actionType: AuditActionType.MODIFY,
        actor,
        payload: { from: booking.status, to: BookingStatus.COMPLETED },
      });
      completed += 1;
    }

    return completed;
  }

  async findById(bookingId: string): Promise<Booking> {
    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, deletedAt: null },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async search(businessId: string, dto: BookingSearchRequestDto): Promise<PaginatedResult<Booking>> {
    const where: Prisma.BookingWhereInput = { businessId, deletedAt: null };

    if (dto.status) where.status = dto.status;
    if (dto.staffId) where.staffId = dto.staffId;
    if (dto.clientId) where.clientId = dto.clientId;
    if (dto.startFrom || dto.startTo) {
      where.startAt = {};
      if (dto.startFrom) (where.startAt as Prisma.DateTimeFilter).gte = new Date(dto.startFrom);
      if (dto.startTo) (where.startAt as Prisma.DateTimeFilter).lte = new Date(dto.startTo);
    }

    const orderBy: Prisma.BookingOrderByWithRelationInput = {
      [dto.orderBy ?? BookingSearchOrderBy.START_AT]: dto.orderDirection ?? OrderDirection.DESC,
    };

    const findArgs: Prisma.BookingFindManyArgs = { where, orderBy };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.booking.findMany(findArgs),
      this.db.booking.count({ where }),
    ]);

    return { items, totalItems };
  }

  async cancel(bookingId: string, tokenPayload: TokenPayloadDto, cancelledBy: CancelledBy, dto: CancelBookingDto): Promise<Booking> {
    const booking = await this.findById(bookingId);
    assertBusinessRole(tokenPayload, booking.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    return this.executeCancellation(booking, cancelledBy, dto.reason, auditActorFromToken(tokenPayload, booking.businessId));
  }

  async cancelByClient(bookingId: string, dto: CancelBookingDto): Promise<Booking> {
    const booking = await this.findById(bookingId);
    const actor: AuditActor = { name: `${booking.clientFirstName} ${booking.clientLastName}`, role: AuditActorRole.CLIENT };
    return this.executeCancellation(booking, CancelledBy.CLIENT, dto.reason, actor);
  }

  async delete(bookingId: string, tokenPayload: TokenPayloadDto): Promise<void> {
    const booking = await this.findById(bookingId);
    assertBusinessRole(tokenPayload, booking.businessId, BusinessRole.OWNER);
    await this.db.$transaction([
      this.db.booking.update({ where: { id: booking.id }, data: { deletedAt: new Date() } }),
      ...(booking.calendarEventId
        ? [this.db.calendarEvent.delete({ where: { id: booking.calendarEventId } })]
        : []),
    ]);
    if (booking.status === BookingStatus.COMPLETED) {
      await this.staffEarnings.reverseForBooking(booking, auditActorFromToken(tokenPayload, booking.businessId));
    }
    this.emitAudit({
      businessId: booking.businessId,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_DELETED,
      actionType: AuditActionType.DELETE,
      actor: auditActorFromToken(tokenPayload, booking.businessId),
      payload: {},
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private async executeCancellation(booking: Booking, cancelledBy: CancelledBy, reason: string | undefined, actor: AuditActor): Promise<Booking> {
    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppException(ErrorCode.BOOKING_ALREADY_CANCELLED, HttpStatus.CONFLICT);
    }
    const updated = await this.db.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledBy,
        cancelledAt: new Date(),
        cancellationReason: reason ?? null,
      },
    });
    if (booking.status === BookingStatus.COMPLETED) {
      await this.staffEarnings.reverseForBooking(updated, actor);
    }
    this.emitAudit({
      businessId: booking.businessId,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_CANCELLED,
      actionType: AuditActionType.MODIFY,
      actor,
      payload: { cancelledBy, reason },
    });
    if (booking.clientEmail && cancelledBy === CancelledBy.STAFF) {
      const { timezone } = await this.businessService.getLocale(booking.businessId);
      this.eventEmitter.emit(NOTIFICATION_EVENT, new BookingStatusChangedNotification(
        { ...booking, clientEmail: booking.clientEmail, timezone },
        'CANCELLED',
        reason,
      ));
    }
    return updated;
  }

  private async updateWithSlotReschedule(old: Booking, businessId: string, dto: UpdateBookingDto): Promise<Booking> {
    const serviceId = dto.serviceId ?? old.serviceId;
    const staffId = dto.staffId !== undefined ? dto.staffId : old.staffId;

    if (!staffId) throw new AppException(ErrorCode.BOOKING_STAFF_NOT_FOUND, HttpStatus.NOT_FOUND);

    const [business, service] = await Promise.all([
      this.db.business.findUnique({
        where: { id: businessId },
        select: { timezone: true },
      }),
      this.db.service.findFirst({
        where: { id: serviceId, businessId, status: ServiceStatus.ACTIVE },
        select: { id: true, title: true, durationMinutes: true, price: true },
      }),
    ]);

    if (!business) throw new AppException(ErrorCode.BOOKING_BUSINESS_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (!service) throw new AppException(ErrorCode.BOOKING_SERVICE_NOT_FOUND, HttpStatus.NOT_FOUND);

    const startAt = dto.startAt ? this.time.localToUtc(dto.startAt, business.timezone) : old.startAt;
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    const dateStr = this.time.zonedDateStr(startAt, business.timezone);

    if (dto.staffId !== undefined || dto.serviceId !== undefined) {
      const candidates = await this.staffService.resolveStaffForService(businessId, serviceId, staffId);
      if (candidates.length === 0) throw new AppException(ErrorCode.BOOKING_STAFF_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    const staff = await this.staffService.findById(staffId);

    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${this.buildLockKey(staffId, dateStr)})`;

      const [shift, blockEvents] = await Promise.all([
        tx.staffShift.findFirst({ where: { staffId, date: new Date(dateStr) } }),
        tx.calendarEvent.findMany({
          where: {
            businessId,
            OR: [{ staffId: null }, { staffId }],
            repeatType: CalendarEventRepeatType.NONE,
            startDateTime: { lte: endAt },
            endDateTime: { gte: startAt },
            NOT: old.calendarEventId ? { id: old.calendarEventId } : undefined,
          },
          include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
        }),
      ]);

      if (!this.calendarService.isSlotFree(staffId, dateStr, startAt, endAt, shift, blockEvents, business.timezone)) {
        this.logger.warn(`slot unavailable on update: bookingId=${old.id} staffId=${staffId} startAt=${startAt.toISOString()}`);
        throw new AppException(ErrorCode.BOOKING_SLOT_UNAVAILABLE, HttpStatus.CONFLICT);
      }

      if (old.calendarEventId) {
        await tx.calendarEvent.update({
          where: { id: old.calendarEventId },
          data: { staffId, startDateTime: startAt, endDateTime: endAt },
        });
      } else {
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
        await tx.booking.update({ where: { id: old.id }, data: { calendarEventId: calendarEvent.id } });
      }

      return tx.booking.update({
        where: { id: old.id },
        data: {
          staffId,
          serviceId: service.id,
          startAt,
          endAt,
          serviceTitle: service.title,
          serviceDuration: service.durationMinutes,
          servicePrice: service.price,
          staffName: staff.name,
          clientFirstName: dto.firstName ?? old.clientFirstName,
          clientLastName: dto.lastName ?? old.clientLastName,
          clientPhone: dto.phone ?? old.clientPhone,
          clientEmail: dto.email !== undefined ? (dto.email ?? null) : old.clientEmail,
          customPrice: dto.customPrice !== undefined ? dto.customPrice : undefined,
          notes: dto.notes !== undefined ? (dto.notes ?? null) : undefined,
          internalNotes: dto.internalNotes !== undefined ? (dto.internalNotes ?? null) : undefined,
        },
      });
    });
  }

  private emitAudit(params: {
    businessId: string;
    entityId: string;
    eventType: AuditEvent;
    actionType: AuditActionType;
    actor: AuditActor;
    payload: Record<string, unknown>;
  }): void {
    const event: AuditLogEvent = {
      businessId: params.businessId,
      entityType: AuditEntity.BOOKING,
      entityId: params.entityId,
      eventType: params.eventType,
      actionType: params.actionType,
      occurredAt: new Date(),
      actor: params.actor,
      payload: params.payload,
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  private buildLockKey(staffId: string, dateStr: string): bigint {
    const hash = createHash('sha256').update(`${staffId}:${dateStr}`).digest();
    return hash.readBigInt64BE(0);
  }
}
