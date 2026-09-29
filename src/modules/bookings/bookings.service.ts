import { createHash } from 'crypto';
import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Booking, BusinessRole, CalendarEventRepeatType, CalendarEventType, CancelledBy, Prisma, ServiceStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { stableOrderBy } from '../../shared/database/stable-order-by.js';
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

const SEARCH_TEXT_COLUMNS = new Set([
  'clientFirstName',
  'clientLastName',
  'clientPhone',
  'clientEmail',
  'serviceTitle',
  'staffName',
  'notes',
  'internalNotes',
  'cancellationReason',
]);

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly db: DatabaseService,
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
      const currency = changes.some((change) => change.field === 'customPrice')
        ? (await this.businessService.getLocale(businessId)).currency
        : undefined;
      this.emitAudit({
        businessId,
        entityId: bookingId,
        eventType: AuditEvent.BOOKING_UPDATED,
        actionType: AuditActionType.MODIFY,
        actor,
        payload: { changes, ...(currency ? { currency } : {}) },
      });
    }

    return updated;
  }

  async updateStatus(bookingId: string, tokenPayload: TokenPayloadDto, dto: UpdateBookingStatusDto): Promise<Booking> {
    const old = await this.findById(bookingId);
    assertBusinessRole(tokenPayload, old.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const reversesCommission = old.status === BookingStatus.COMPLETED && dto.status !== BookingStatus.COMPLETED;
    const reversalReason = reversesCommission ? this.optionalReason(dto.reason) : null;
    const updated = await this.db.booking.update({ where: { id: bookingId }, data: { status: dto.status } });
    const actor = auditActorFromToken(tokenPayload, old.businessId);
    if (dto.status === BookingStatus.COMPLETED && old.status !== BookingStatus.COMPLETED) {
      await this.staffEarnings.recordForCompletedBooking(updated);
    } else if (reversesCommission) {
      await this.staffEarnings.reverseForBooking(updated, reversalReason, actor);
    }
    this.emitAudit({
      businessId: old.businessId,
      entityId: bookingId,
      eventType: AuditEvent.BOOKING_STATUS_CHANGED,
      actionType: AuditActionType.MODIFY,
      actor,
      payload: { from: old.status, to: dto.status, ...(reversalReason ? { reason: reversalReason } : {}) },
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
    const where = this.buildSearchWhere(businessId, dto);
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy = dto.orderBy ?? BookingSearchOrderBy.START_AT;

    if (orderBy === BookingSearchOrderBy.PRICE) {
      return this.searchByChargedPrice(where, dto, direction);
    }

    const findArgs: Prisma.BookingFindManyArgs = {
      where,
      orderBy: stableOrderBy(this.searchOrderBy(orderBy, direction), direction),
    };
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

  private buildSearchWhere(businessId: string, dto: BookingSearchRequestDto): Prisma.BookingWhereInput {
    const where: Prisma.BookingWhereInput = { businessId, deletedAt: null };

    if (dto.status) where.status = dto.status;
    if (dto.staffIds?.length) where.staffId = { in: dto.staffIds };
    if (dto.clientId) where.clientId = dto.clientId;
    if (dto.serviceIds?.length) where.serviceId = { in: dto.serviceIds };
    if (dto.startFrom || dto.startTo) {
      where.startAt = {};
      if (dto.startFrom) (where.startAt as Prisma.DateTimeFilter).gte = new Date(dto.startFrom);
      if (dto.startTo) (where.startAt as Prisma.DateTimeFilter).lte = new Date(dto.startTo);
    }
    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(dto.createdFrom);
      if (dto.createdTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(dto.createdTo);
    }
    const search = dto.search?.trim();
    if (search) {
      where.OR = [
        { clientFirstName: { contains: search, mode: 'insensitive' } },
        { clientLastName: { contains: search, mode: 'insensitive' } },
        { clientPhone: { contains: search } },
        { clientEmail: { contains: search, mode: 'insensitive' } },
        { serviceTitle: { contains: search, mode: 'insensitive' } },
        { staffName: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { internalNotes: { contains: search, mode: 'insensitive' } },
        { cancellationReason: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private searchOrderBy(
    orderBy: BookingSearchOrderBy,
    direction: OrderDirection,
  ): Prisma.BookingOrderByWithRelationInput | Prisma.BookingOrderByWithRelationInput[] {
    switch (orderBy) {
      case BookingSearchOrderBy.CLIENT_NAME:
        return [{ clientLastName: direction }, { clientFirstName: direction }];
      case BookingSearchOrderBy.SERVICE_TITLE:
        return { serviceTitle: direction };
      case BookingSearchOrderBy.STAFF_NAME:
        return { staffName: direction };
      case BookingSearchOrderBy.STATUS:
        return { status: direction };
      case BookingSearchOrderBy.SOURCE:
        return { source: direction };
      case BookingSearchOrderBy.CREATED_AT:
        return { createdAt: direction };
      case BookingSearchOrderBy.START_AT:
        return { startAt: direction };
      case BookingSearchOrderBy.PRICE:
        throw new Error('Price sort is applied in SQL');
      default: {
        const unexpected: never = orderBy;
        throw new Error(`Unhandled booking search order: ${String(unexpected)}`);
      }
    }
  }

  private async searchByChargedPrice(
    where: Prisma.BookingWhereInput,
    dto: BookingSearchRequestDto,
    direction: OrderDirection,
  ): Promise<PaginatedResult<Booking>> {
    const directionSql = direction === OrderDirection.ASC ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const paginationSql = dto.isExport
      ? Prisma.empty
      : Prisma.sql`LIMIT ${dto.pageSize} OFFSET ${(dto.page - 1) * dto.pageSize}`;
    const orderedIds = Prisma.sql`
      SELECT "id"
      FROM "Booking"
      WHERE ${this.bookingWhereSql(where)}
      ORDER BY COALESCE("customPrice", "servicePrice") ${directionSql}, "id" ${directionSql}
      ${paginationSql}
    `;

    const [idRows, totalItems] = await this.db.$transaction([
      this.db.$queryRaw<{ id: string }[]>(orderedIds),
      this.db.booking.count({ where }),
    ]);

    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) return { items: [], totalItems };

    const items = await this.db.booking.findMany({ where: { id: { in: ids } } });
    const byId = new Map(items.map((item) => [item.id, item]));
    return {
      items: ids.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      }),
      totalItems,
    };
  }

  private bookingWhereSql(where: Prisma.BookingWhereInput): Prisma.Sql {
    const parts = Object.keys(where).map((key) => this.bookingWherePart(key, where));
    return Prisma.join(parts, ' AND ');
  }

  private bookingWherePart(key: string, where: Prisma.BookingWhereInput): Prisma.Sql {
    switch (key) {
      case 'businessId':
        if (typeof where.businessId !== 'string') throw new Error('Unhandled booking search filter: businessId');
        return Prisma.sql`"businessId" = ${where.businessId}`;
      case 'deletedAt':
        if (where.deletedAt !== null) throw new Error('Unhandled booking search filter: deletedAt');
        return Prisma.sql`"deletedAt" IS NULL`;
      case 'status':
        if (typeof where.status !== 'string') throw new Error('Unhandled booking search filter: status');
        return Prisma.sql`"status"::text = ${where.status}`;
      case 'clientId':
        if (typeof where.clientId !== 'string') throw new Error('Unhandled booking search filter: clientId');
        return Prisma.sql`"clientId" = ${where.clientId}`;
      case 'staffId':
        return this.uuidInSql('staffId', where.staffId);
      case 'serviceId':
        return this.uuidInSql('serviceId', where.serviceId);
      case 'startAt':
        return this.dateRangeSql('startAt', where.startAt);
      case 'createdAt':
        return this.dateRangeSql('createdAt', where.createdAt);
      case 'OR':
        return this.searchOrSql(where.OR);
      default:
        throw new Error(`Unhandled booking search filter: ${key}`);
    }
  }

  private uuidInSql(column: 'staffId' | 'serviceId', value: Prisma.BookingWhereInput['staffId']): Prisma.Sql {
    if (value == null || typeof value !== 'object' || !('in' in value) || !Array.isArray(value.in) || value.in.length === 0) {
      throw new Error(`Unhandled booking search filter: ${column}`);
    }
    if (Object.keys(value).some((key) => key !== 'in')) throw new Error(`Unhandled booking search filter: ${column}`);
    return column === 'staffId'
      ? Prisma.sql`"staffId" IN (${Prisma.join(value.in)})`
      : Prisma.sql`"serviceId" IN (${Prisma.join(value.in)})`;
  }

  private dateRangeSql(column: 'startAt' | 'createdAt', value: Prisma.BookingWhereInput['startAt']): Prisma.Sql {
    if (value == null || typeof value !== 'object' || value instanceof Date) {
      throw new Error(`Unhandled booking search filter: ${column}`);
    }
    const range = value as Prisma.DateTimeFilter;
    if (Object.keys(range).some((key) => key !== 'gte' && key !== 'lte')) {
      throw new Error(`Unhandled booking search filter: ${column}`);
    }
    const parts: Prisma.Sql[] = [];
    if (column === 'startAt') {
      if (range.gte != null) parts.push(Prisma.sql`"startAt" >= ${range.gte}`);
      if (range.lte != null) parts.push(Prisma.sql`"startAt" <= ${range.lte}`);
    } else {
      if (range.gte != null) parts.push(Prisma.sql`"createdAt" >= ${range.gte}`);
      if (range.lte != null) parts.push(Prisma.sql`"createdAt" <= ${range.lte}`);
    }
    if (parts.length === 0) throw new Error(`Unhandled booking search filter: ${column}`);
    return Prisma.join(parts, ' AND ');
  }

  private searchOrSql(value: Prisma.BookingWhereInput['OR']): Prisma.Sql {
    if (!Array.isArray(value) || value.length === 0) throw new Error('Unhandled booking search filter: OR');
    const parts = value.map((clause) => {
      if (clause == null || typeof clause !== 'object') throw new Error('Unhandled booking search filter: OR');
      const keys = Object.keys(clause);
      if (keys.length !== 1) throw new Error('Unhandled booking search filter: OR');
      const field = keys[0];
      return this.containsSql(field, clause[field as keyof typeof clause]);
    });
    return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
  }

  private containsSql(field: string, filter: unknown): Prisma.Sql {
    if (filter == null || typeof filter !== 'object' || !('contains' in filter) || typeof filter.contains !== 'string') {
      throw new Error(`Unhandled booking search filter: ${field}`);
    }
    const mode = 'mode' in filter ? filter.mode : undefined;
    if ((mode !== undefined && mode !== 'insensitive') || Object.keys(filter).some((key) => key !== 'contains' && key !== 'mode')) {
      throw new Error(`Unhandled booking search filter: ${field}`);
    }
    if (!SEARCH_TEXT_COLUMNS.has(field)) throw new Error(`Unhandled booking search filter: ${field}`);
    const pattern = `%${filter.contains.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const column = Prisma.raw(`"${field}"`);
    return mode === 'insensitive'
      ? Prisma.sql`${column} ILIKE ${pattern} ESCAPE '\\\\'`
      : Prisma.sql`${column} LIKE ${pattern} ESCAPE '\\\\'`;
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
    const actor = auditActorFromToken(tokenPayload, booking.businessId);
    await this.db.$transaction([
      this.db.booking.update({ where: { id: booking.id }, data: { deletedAt: new Date() } }),
      ...(booking.calendarEventId
        ? [this.db.calendarEvent.delete({ where: { id: booking.calendarEventId } })]
        : []),
    ]);
    if (booking.status === BookingStatus.COMPLETED) {
      await this.staffEarnings.reverseForBooking(booking, null, actor);
    }
    this.emitAudit({
      businessId: booking.businessId,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_DELETED,
      actionType: AuditActionType.DELETE,
      actor,
      payload: {},
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private optionalReason(reason?: string | null): string | null {
    const text = reason?.trim() ?? '';
    return text || null;
  }

  private async executeCancellation(booking: Booking, cancelledBy: CancelledBy, reason: string | undefined, actor: AuditActor): Promise<Booking> {
    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppException(ErrorCode.BOOKING_ALREADY_CANCELLED, HttpStatus.CONFLICT);
    }
    const storedReason = this.optionalReason(reason);
    const updated = await this.db.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledBy,
        cancelledAt: new Date(),
        cancellationReason: storedReason,
      },
    });
    if (booking.status === BookingStatus.COMPLETED) {
      await this.staffEarnings.reverseForBooking(updated, storedReason, actor);
    }
    this.emitAudit({
      businessId: booking.businessId,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_CANCELLED,
      actionType: AuditActionType.MODIFY,
      actor,
      payload: { cancelledBy, reason: storedReason ?? undefined },
    });
    if (booking.clientEmail && cancelledBy === CancelledBy.STAFF) {
      const { timezone } = await this.businessService.getLocale(booking.businessId);
      this.eventEmitter.emit(NOTIFICATION_EVENT, new BookingStatusChangedNotification(
        { ...booking, clientEmail: booking.clientEmail, timezone },
        'CANCELLED',
        storedReason ?? undefined,
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

    const startAt = dto.startAt ? TimeService.localToUtc(dto.startAt, business.timezone) : old.startAt;
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    const dateStr = TimeService.zonedDateStr(startAt, business.timezone);

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

  async getStatusCounts(businessId: string): Promise<{ status: BookingStatus; count: number }[]> {
    const rows = await this.db.booking.groupBy({
      by: ['status'],
      where: { businessId },
      _count: { _all: true },
    });
    return rows.map((r) => ({ status: r.status as BookingStatus, count: r._count._all }));
  }

  private buildLockKey(staffId: string, dateStr: string): bigint {
    const hash = createHash('sha256').update(`${staffId}:${dateStr}`).digest();
    return hash.readBigInt64BE(0);
  }
}
