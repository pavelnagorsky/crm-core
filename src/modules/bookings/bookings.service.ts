import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Booking, CancelledBy, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSearchOrderBy } from './enums/booking-search-order-by.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';

@Injectable()
export class BookingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async updateStatus(bookingId: string, businessId: string, dto: UpdateBookingStatusDto, actor: AuditActor): Promise<Booking> {
    const old = await this.findByIdInBusiness(bookingId, businessId);
    const updated = await this.db.booking.update({ where: { id: bookingId }, data: { status: dto.status } });
    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.BOOKING,
      entityId: bookingId,
      eventType: AuditEvent.BOOKING_STATUS_CHANGED,
      actor,
      payload: { from: old.status, to: dto.status },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return updated;
  }

  async findById(bookingId: string, businessId: string): Promise<Booking> {
    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, businessId, deletedAt: null },
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

  async cancel(bookingId: string, businessId: string, cancelledBy: CancelledBy, dto: CancelBookingDto, actor: AuditActor): Promise<Booking> {
    const booking = await this.findByIdInBusiness(bookingId, businessId);
    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppException(ErrorCode.BOOKING_ALREADY_CANCELLED, HttpStatus.CONFLICT);
    }
    const updated = await this.db.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledBy,
        cancelledAt: new Date(),
        cancellationReason: dto.reason ?? null,
      },
    });
    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.BOOKING,
      entityId: bookingId,
      eventType: AuditEvent.BOOKING_CANCELLED,
      actor,
      payload: { cancelledBy, reason: dto.reason },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return updated;
  }

  async delete(bookingId: string, businessId: string, actor: AuditActor): Promise<void> {
    const booking = await this.findByIdInBusiness(bookingId, businessId);
    await this.db.$transaction([
      this.db.booking.update({ where: { id: bookingId }, data: { deletedAt: new Date() } }),
      ...(booking.calendarEventId
        ? [this.db.calendarEvent.delete({ where: { id: booking.calendarEventId } })]
        : []),
    ]);
    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.BOOKING,
      entityId: bookingId,
      eventType: AuditEvent.BOOKING_DELETED,
      actor,
      payload: {},
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  private async findByIdInBusiness(bookingId: string, businessId: string): Promise<Booking> {
    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, businessId, deletedAt: null },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }
}
