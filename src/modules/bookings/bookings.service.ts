import { createHash } from 'crypto';
import { forwardRef, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Booking, BusinessRole, CalendarEventRepeatType, CalendarEventType, CancelledBy, Prisma, ServiceStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { stableOrderBy } from '../../shared/database/stable-order-by.js';
import { MoneyService } from '../../shared/money/money.service.js';
import { TimeService } from '../time/time.service.js';
import { CalendarBookingReader } from '../calendar/calendar-booking-reader.js';
import { CalendarBookingFeed } from '../calendar/interfaces/calendar-booking-feed.interface.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { StaffService } from '../staff/staff.service.js';
import { StaffEarningsService } from '../payroll/earnings/staff-earnings.service.js';
import { BusinessService } from '../business/business.service.js';
import { BookingSetupCategoryDto } from './dto/booking-setup-category.dto.js';
import { BookingSetupResponseDto } from './dto/booking-setup-response.dto.js';
import { BookingSetupStaffDto } from './dto/booking-setup-staff.dto.js';
import { BookingSetupBundleDto } from './dto/booking-setup-bundle.dto.js';
import { BookingResolveRequestDto } from './dto/booking-resolve-request.dto.js';
import { BookingResolveResponseDto } from './dto/booking-resolve-response.dto.js';
import { StaffSelectionMode } from './enums/staff-selection-mode.enum.js';
import { BookingExecutionMode } from './enums/booking-execution-mode.enum.js';
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
import { BookingWithItems } from './interfaces/booking-with-items.interface.js';

const CALENDAR_VISIBLE_STATUSES: ReadonlySet<string> = new Set([
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
  BookingStatus.NO_SHOW,
]);

const bookingWithItemsInclude = {
  items: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class BookingsService implements CalendarBookingReader {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => CalendarService))
    private readonly calendarService: CalendarService,
    private readonly staffService: StaffService,
    private readonly businessService: BusinessService,
    private readonly staffEarnings: StaffEarningsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getBookingSetup(businessId: string): Promise<BookingSetupResponseDto> {
    const servicesOrder = [{ sortOrder: 'asc' as const }, { title: 'asc' as const }];

    const [[categories, uncategorized], staff, bundles] = await Promise.all([
      this.db.$transaction([
        this.db.serviceCategory.findMany({
          where: { businessId },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            services: { where: { status: ServiceStatus.ACTIVE }, orderBy: servicesOrder, include: { imageFile: true } },
          },
        }),
        this.db.service.findMany({
          where: { businessId, categoryId: null, status: ServiceStatus.ACTIVE },
          orderBy: servicesOrder,
          include: { imageFile: true },
        }),
      ]),
      this.staffService.listActiveWithServices(businessId),
      this.db.serviceBundle.findMany({
        where: { businessId, status: ServiceStatus.ACTIVE },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        include: {
          imageFile: true,
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { service: true },
          },
        },
      }),
    ]);

    const result = categories.map(BookingSetupCategoryDto.fromEntity);
    if (uncategorized.length) result.push(BookingSetupCategoryDto.uncategorized(uncategorized));

    return {
      categories: result,
      staff: staff.map(BookingSetupStaffDto.fromEntity),
      bundles: bundles.map(BookingSetupBundleDto.fromEntity),
    };
  }

  async resolveBookingSelection(
    businessId: string,
    dto: BookingResolveRequestDto,
  ): Promise<BookingResolveResponseDto> {
    if (dto.bundleId && dto.serviceIds?.length) {
      throw new AppException(ErrorCode.BOOKING_SELECTION_CONFLICT, HttpStatus.BAD_REQUEST);
    }

    const [services, bundles] = await Promise.all([
      this.db.service.findMany({
        where: { businessId, status: ServiceStatus.ACTIVE },
        select: { id: true, price: true, durationMinutes: true, bufferMinutes: true },
      }),
      this.db.serviceBundle.findMany({
        where: { businessId, status: ServiceStatus.ACTIVE },
        include: { items: { orderBy: { sortOrder: 'asc' }, include: { service: true } } },
      }),
    ]);
    const serviceById = new Map(services.map((service) => [service.id, service]));

    if (dto.staffId) {
      const performable = new Set(await this.staffService.servicesPerformableBy(businessId, dto.staffId));
      const availableServiceIds = services
        .filter((service) => performable.has(service.id))
        .map((service) => service.id);
      for (const bundle of bundles) {
        if (bundle.items.every((item) => performable.has(item.serviceId))) availableServiceIds.push(bundle.id);
      }
      return {
        availableServiceIds,
        availableStaff: [{ id: dto.staffId, name: (await this.staffService.findById(dto.staffId)).name }],
        staffSelection: StaffSelectionMode.SINGLE,
        executionMode: BookingExecutionMode.SEQUENTIAL,
        totalDuration: 0,
        totalListPrice: MoneyService.format(0),
      };
    }

    const selected = dto.bundleId
      ? bundles.find((bundle) => bundle.id === dto.bundleId)?.items.map((item) => item.service)
      : dto.serviceIds?.map((id) => serviceById.get(id)).filter((service): service is NonNullable<typeof service> => !!service);
    const executionMode = dto.bundleId
      ? (bundles.find((bundle) => bundle.id === dto.bundleId)?.executionMode as BookingExecutionMode | undefined) ?? BookingExecutionMode.SEQUENTIAL
      : BookingExecutionMode.SEQUENTIAL;

    if (!selected?.length) {
      return {
        availableServiceIds: services.map((service) => service.id),
        availableStaff: (await this.staffService.listActiveWithServices(businessId)).map((staff) => ({ id: staff.id, name: staff.name })),
        staffSelection: StaffSelectionMode.SINGLE,
        executionMode: BookingExecutionMode.SEQUENTIAL,
        totalDuration: 0,
        totalListPrice: MoneyService.format(0),
      };
    }

    const staffing = await this.staffService.resolveStaffingForServices(
      businessId,
      selected.map((service) => service.id),
    );
    const bundle = dto.bundleId ? bundles.find((item) => item.id === dto.bundleId) : null;
    const totalListPrice = bundle?.fixedPrice ?? selected.reduce((sum, service) => sum.plus(service.price), new Prisma.Decimal(0));
    const totalDuration = executionMode === BookingExecutionMode.PARALLEL
      ? Math.max(...selected.map((service) => service.durationMinutes + service.bufferMinutes), 0)
      : selected.reduce((sum, service) => sum + service.durationMinutes + service.bufferMinutes, 0);

    return {
      availableServiceIds: services.map((service) => service.id),
      availableStaff: staffing.coverableBySingle,
      staffSelection: staffing.coverableBySingle.length ? StaffSelectionMode.SINGLE : StaffSelectionMode.NONE,
      executionMode,
      totalDuration,
      totalListPrice: MoneyService.format(totalListPrice),
    };
  }

  async update(bookingId: string, tokenPayload: TokenPayloadDto, dto: UpdateBookingDto): Promise<BookingWithItems> {
    const old = await this.findById(bookingId);
    assertBusinessRole(tokenPayload, old.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const { businessId } = old;
    const actor = auditActorFromToken(tokenPayload, businessId);

    if (dto.serviceId !== undefined) {
      throw new AppException(ErrorCode.BAD_REQUEST, HttpStatus.BAD_REQUEST);
    }
    const slotChanging = dto.startAt !== undefined || dto.staffId !== undefined;

    const updated = slotChanging
      ? await this.updateWithSlotReschedule(old, businessId, dto)
      : await this.db.booking.update({
          where: { id: bookingId },
          data: {
            clientFirstName: dto.firstName ?? old.clientFirstName,
            clientLastName: dto.lastName ?? old.clientLastName,
            clientPhone: dto.phone ?? old.clientPhone,
            clientEmail: dto.email !== undefined ? (dto.email ?? null) : old.clientEmail,
            notes: dto.notes !== undefined ? (dto.notes ?? null) : undefined,
            internalNotes: dto.internalNotes !== undefined ? (dto.internalNotes ?? null) : undefined,
            ...(dto.customPrice !== undefined && old.items[0]
              ? {
                  items: {
                    update: {
                      where: { id: old.items[0].id },
                      data: { customPrice: dto.customPrice },
                    },
                  },
                }
              : {}),
          },
          include: bookingWithItemsInclude,
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

  async updateStatus(bookingId: string, tokenPayload: TokenPayloadDto, dto: UpdateBookingStatusDto): Promise<BookingWithItems> {
    const old = await this.findById(bookingId);
    assertBusinessRole(tokenPayload, old.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const reversesCommission = old.status === BookingStatus.COMPLETED && dto.status !== BookingStatus.COMPLETED;
    const reversalReason = reversesCommission ? this.optionalReason(dto.reason) : null;
    const updated = await this.db.booking.update({ where: { id: bookingId }, data: { status: dto.status }, include: bookingWithItemsInclude });
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
        { ...this.notificationData(old), clientEmail: old.clientEmail, timezone },
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
      include: bookingWithItemsInclude,
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

  async listForCalendar(
    businessId: string,
    rangeStart: Date,
    rangeEnd: Date,
    staffIds?: string[],
  ): Promise<CalendarBookingFeed> {
    const rows = await this.db.bookingItem.findMany({
      where: {
        businessId,
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
        ...(staffIds?.length ? { staffId: { in: staffIds } } : {}),
        booking: { deletedAt: null },
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        staffId: true,
        staffName: true,
        serviceTitle: true,
        chargedPrice: true,
        customPrice: true,
        startAt: true,
        endAt: true,
        calendarEventId: true,
        booking: {
          select: {
            id: true,
            clientFirstName: true,
            clientLastName: true,
            status: true,
          },
        },
      },
    });

    return {
      bookings: rows.filter((row) => CALENDAR_VISIBLE_STATUSES.has(row.booking.status)).map((row) => ({
        id: row.booking.id,
        staffId: row.staffId,
        staffName: row.staffName,
        clientFirstName: row.booking.clientFirstName,
        clientLastName: row.booking.clientLastName,
        serviceTitle: row.serviceTitle,
        servicePrice: MoneyService.format(row.chargedPrice),
        customPrice: row.customPrice == null ? null : MoneyService.format(row.customPrice),
        startAt: row.startAt,
        endAt: row.endAt,
      })),
      linkedEventIds: rows.flatMap((row) => (row.calendarEventId ? [row.calendarEventId] : [])),
    };
  }

  async findById(bookingId: string): Promise<BookingWithItems> {
    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, deletedAt: null },
      include: bookingWithItemsInclude,
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async search(businessId: string, dto: BookingSearchRequestDto): Promise<PaginatedResult<BookingWithItems>> {
    const where = this.buildSearchWhere(businessId, dto);
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy = dto.orderBy ?? BookingSearchOrderBy.START_AT;

    if (orderBy === BookingSearchOrderBy.PRICE) {
      return this.searchByChargedPrice(where, dto, direction);
    }

    const findArgs: Prisma.BookingFindManyArgs = {
      where,
      orderBy: stableOrderBy(this.searchOrderBy(orderBy, direction), direction),
      include: bookingWithItemsInclude,
    };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await Promise.all([
      this.db.booking.findMany(findArgs) as Promise<BookingWithItems[]>,
      this.db.booking.count({ where }),
    ]);

    return { items, totalItems };
  }

  private buildSearchWhere(businessId: string, dto: BookingSearchRequestDto): Prisma.BookingWhereInput {
    const where: Prisma.BookingWhereInput = { businessId, deletedAt: null };

    if (dto.status) where.status = dto.status;
    if (dto.staffIds?.length) where.items = { some: { staffId: { in: dto.staffIds } } };
    if (dto.clientId) where.clientId = dto.clientId;
    if (dto.serviceIds?.length) {
      where.items = {
        some: {
          ...(where.items && 'some' in where.items ? where.items.some : {}),
          serviceId: { in: dto.serviceIds },
        },
      };
    }
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
        { items: { some: { serviceTitle: { contains: search, mode: 'insensitive' } } } },
        { items: { some: { staffName: { contains: search, mode: 'insensitive' } } } },
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
        return { startAt: direction };
      case BookingSearchOrderBy.STAFF_NAME:
        return { startAt: direction };
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
  ): Promise<PaginatedResult<BookingWithItems>> {
    const [all, totalItems] = await this.db.$transaction([
      this.db.booking.findMany({ where, include: bookingWithItemsInclude }),
      this.db.booking.count({ where }),
    ]);
    const multiplier = direction === OrderDirection.ASC ? 1 : -1;
    const ordered = all.sort((a, b) => {
      const aTotal = this.bookingChargedTotal(a);
      const bTotal = this.bookingChargedTotal(b);
      const priceOrder = aTotal.comparedTo(bTotal) * multiplier;
      return priceOrder || a.id.localeCompare(b.id) * multiplier;
    });
    const items = dto.isExport
      ? ordered
      : ordered.slice((dto.page - 1) * dto.pageSize, dto.page * dto.pageSize);
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
    const actor = auditActorFromToken(tokenPayload, booking.businessId);
    await this.db.$transaction([
      this.db.booking.update({ where: { id: booking.id }, data: { deletedAt: new Date() } }),
      ...booking.items
        .flatMap((item) => item.calendarEventId ? [this.db.calendarEvent.delete({ where: { id: item.calendarEventId } })] : []),
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

  private async executeCancellation(booking: BookingWithItems, cancelledBy: CancelledBy, reason: string | undefined, actor: AuditActor): Promise<BookingWithItems> {
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
      include: bookingWithItemsInclude,
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
        { ...this.notificationData(booking), clientEmail: booking.clientEmail, timezone },
        'CANCELLED',
        storedReason ?? undefined,
      ));
    }
    return updated;
  }

  private async updateWithSlotReschedule(old: BookingWithItems, businessId: string, dto: UpdateBookingDto): Promise<BookingWithItems> {
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (!business) throw new AppException(ErrorCode.BOOKING_BUSINESS_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (old.items.length === 0) throw new AppException(ErrorCode.BOOKING_SERVICE_NOT_FOUND, HttpStatus.NOT_FOUND);

    const newStartAt = dto.startAt ? TimeService.localToUtc(dto.startAt, business.timezone) : old.startAt;
    const deltaMs = newStartAt.getTime() - old.startAt.getTime();
    const targetStaffId = dto.staffId;
    const targetStaff = targetStaffId ? await this.staffService.findById(targetStaffId) : null;

    const movedItems = await Promise.all(old.items.map(async (item) => {
      const staffId = targetStaffId ?? item.staffId;
      if (targetStaffId) {
        const candidates = await this.staffService.resolveStaffForService(businessId, item.serviceId, targetStaffId);
        if (candidates.length === 0) throw new AppException(ErrorCode.BOOKING_STAFF_NOT_FOUND, HttpStatus.NOT_FOUND);
      }
      return {
        ...item,
        staffId,
        staffName: targetStaff?.name ?? item.staffName,
        startAt: new Date(item.startAt.getTime() + deltaMs),
        endAt: new Date(item.endAt.getTime() + deltaMs),
      };
    }));
    const lockKeys = [...new Set(movedItems.map((item) => `${item.staffId}:${TimeService.zonedDateStr(item.startAt, business.timezone)}`))]
      .map((key) => {
        const [staffId, dateStr] = key.split(':');
        return this.buildLockKey(staffId, dateStr);
      })
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    return this.db.$transaction(async (tx) => {
      for (const lockKey of lockKeys) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
      }

      for (const item of movedItems) {
        const dateStr = TimeService.zonedDateStr(item.startAt, business.timezone);
        const [shift, blockEvents] = await Promise.all([
          tx.staffShift.findFirst({ where: { staffId: item.staffId, date: new Date(dateStr) } }),
          tx.calendarEvent.findMany({
            where: {
              businessId,
              OR: [{ staffId: null }, { staffId: item.staffId }],
              repeatType: CalendarEventRepeatType.NONE,
              startDateTime: { lte: item.endAt },
              endDateTime: { gte: item.startAt },
              NOT: item.calendarEventId ? { id: item.calendarEventId } : undefined,
            },
            include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
          }),
        ]);

        if (!this.calendarService.isSlotFree(item.staffId, dateStr, item.startAt, item.endAt, shift, blockEvents, business.timezone)) {
          this.logger.warn(`slot unavailable on update: bookingId=${old.id} staffId=${item.staffId} startAt=${item.startAt.toISOString()}`);
          throw new AppException(ErrorCode.BOOKING_SLOT_UNAVAILABLE, HttpStatus.CONFLICT);
        }
      }

      for (const item of movedItems) {
        let calendarEventId = item.calendarEventId;
        if (calendarEventId) {
          await tx.calendarEvent.update({
            where: { id: calendarEventId },
            data: { staffId: item.staffId, startDateTime: item.startAt, endDateTime: item.endAt },
          });
        } else {
          const event = await tx.calendarEvent.create({
            data: {
              businessId,
              staffId: item.staffId,
              type: CalendarEventType.BOOKING,
              repeatType: CalendarEventRepeatType.NONE,
              startDateTime: item.startAt,
              endDateTime: item.endAt,
            },
          });
          calendarEventId = event.id;
        }
        await tx.bookingItem.update({
          where: { id: item.id },
          data: {
            staffId: item.staffId,
            staffName: item.staffName,
            startAt: item.startAt,
            endAt: item.endAt,
            calendarEventId,
          },
        });
      }

      return tx.booking.update({
        where: { id: old.id },
        data: {
          startAt: new Date(Math.min(...movedItems.map((item) => item.startAt.getTime()))),
          endAt: new Date(Math.max(...movedItems.map((item) => item.endAt.getTime()))),
          clientFirstName: dto.firstName ?? old.clientFirstName,
          clientLastName: dto.lastName ?? old.clientLastName,
          clientPhone: dto.phone ?? old.clientPhone,
          clientEmail: dto.email !== undefined ? (dto.email ?? null) : old.clientEmail,
          notes: dto.notes !== undefined ? (dto.notes ?? null) : undefined,
          internalNotes: dto.internalNotes !== undefined ? (dto.internalNotes ?? null) : undefined,
          ...(dto.customPrice !== undefined && old.items[0]
            ? {
                items: {
                  update: {
                    where: { id: old.items[0].id },
                    data: { customPrice: dto.customPrice },
                  },
                },
              }
            : {}),
        },
        include: bookingWithItemsInclude,
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

  private bookingChargedTotal(booking: BookingWithItems): Prisma.Decimal {
    return booking.items.reduce(
      (sum, item) => sum.plus(item.customPrice ?? item.chargedPrice),
      new Prisma.Decimal(0),
    );
  }

  private notificationData(booking: BookingWithItems): {
    id: string;
    clientFirstName: string;
    clientLastName: string;
    serviceTitle: string;
    staffName: string;
    startAt: Date;
    endAt: Date;
  } {
    return {
      id: booking.id,
      clientFirstName: booking.clientFirstName,
      clientLastName: booking.clientLastName,
      serviceTitle: booking.items.map((item) => item.serviceTitle).join(', '),
      staffName: [...new Set(booking.items.map((item) => item.staffName))].join(', '),
      startAt: booking.startAt,
      endAt: booking.endAt,
    };
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
