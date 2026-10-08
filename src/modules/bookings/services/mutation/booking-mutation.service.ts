import { createHash } from 'crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Booking, BusinessRole, CancelledBy, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { TimeService } from '../../../../shared/time/time.service.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditActorRole } from '../../../audit/enums/audit-actor-role.enum.js';
import { AuditEntity } from '../../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import { BOOKING_AUDIT_FIELDS } from '../../../audit/fields/booking.fields.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AuditFieldChange } from '../../../audit/interfaces/audit-payload.interface.js';
import { AuditLogEvent } from '../../../audit/interfaces/audit-log-event.interface.js';
import { auditActorFromToken } from '../../../audit/utils/audit-actor-from-token.js';
import { diffFields } from '../../../audit/utils/diff-fields.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { assertLocationRole } from '../../../auth/guards/assert-location-role.js';
import { CalendarService } from '../../../calendar/calendar.service.js';
import { LocationService } from '../../../location/location.service.js';
import { NOTIFICATION_EVENT } from '../../../notifications/notifications.service.js';
import { BookingStatusChangedNotification } from '../../../notifications/notifications/booking-status-changed.notification.js';
import { OrderProductItemDto } from '../../../orders/dto/order-product-item.dto.js';
import { OrderWithItems } from '../../../orders/interfaces/order-with-items.interface.js';
import { OrdersService } from '../../../orders/orders.service.js';
import { StaffEarningsService } from '../../../payroll/earnings/staff-earnings.service.js';
import { StaffService } from '../../../staff/staff.service.js';
import { bookingWithItemsInclude } from '../../constants/booking-with-items.include.js';
import { CancelBookingDto } from '../../dto/cancel-booking.dto.js';
import { UpdateBookingItemPriceDto } from '../../dto/update-booking-item-price.dto.js';
import { UpdateBookingStatusDto } from '../../dto/update-booking-status.dto.js';
import { UpdateBookingDto } from '../../dto/update-booking.dto.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { AUTO_COMPLETABLE_STATUSES } from '../../rules/booking-cron.rules.js';
import { BookingReadService } from '../read/booking-read.service.js';

@Injectable()
export class BookingMutationService {
  private readonly logger = new Logger(BookingMutationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly calendarService: CalendarService,
    private readonly staffService: StaffService,
    private readonly locationService: LocationService,
    private readonly staffEarnings: StaffEarningsService,
    private readonly orders: OrdersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly read: BookingReadService,
  ) {}

  async update(
    locationId: string,
    bookingId: string,
    tokenPayload: TokenPayloadDto,
    dto: UpdateBookingDto,
  ): Promise<BookingWithItems> {
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
    const old = await this.read.findByIdInLocation(locationId, bookingId);
    assertLocationRole(
      tokenPayload,
      old.locationId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
    const actor = auditActorFromToken(tokenPayload, locationId);

    const slotChanging = dto.startAt !== undefined || dto.staffId !== undefined;
    const pricePatches = this.pricePatches(old, dto);

    const updateArgs = {
      where: { id: bookingId },
      data: {
        clientFirstName: dto.firstName ?? old.clientFirstName,
        clientLastName: dto.lastName ?? old.clientLastName,
        clientPhone: dto.phone ?? old.clientPhone,
        clientEmail:
          dto.email !== undefined ? (dto.email ?? null) : old.clientEmail,
        notes: dto.notes !== undefined ? (dto.notes ?? null) : undefined,
        internalNotes:
          dto.internalNotes !== undefined
            ? (dto.internalNotes ?? null)
            : undefined,
        ...this.itemPriceWrite(pricePatches),
      },
      include: bookingWithItemsInclude,
    } satisfies Prisma.BookingUpdateArgs;
    let updated: BookingWithItems;
    if (slotChanging) {
      updated = await this.updateWithSlotReschedule(
        old,
        locationId,
        dto,
        pricePatches,
        actor,
      );
    } else if (
      old.status === BookingStatus.COMPLETED &&
      pricePatches.length > 0
    ) {
      updated = await this.db.$transaction(async (tx) => {
        const result = await tx.booking.update(updateArgs);
        const order = await this.orders.syncCompletedBooking(result, actor, tx);
        await this.staffEarnings.syncForCompletedBooking(
          result,
          actor,
          tx,
          order,
        );
        return result;
      });
    } else {
      updated = await this.db.booking.update(updateArgs);
    }

    const changes = [
      ...diffFields(old, updated, BOOKING_AUDIT_FIELDS),
      ...this.itemValueChanges(
        old,
        updated,
        'staffName',
        (item) => item.staffName,
      ),
      ...this.itemValueChanges(old, updated, 'customPrice', (item) =>
        item.customPrice == null ? null : MoneyService.format(item.customPrice),
      ),
    ];
    if (changes.length > 0) {
      const currency = changes.some((change) => change.field === 'customPrice')
        ? (await this.locationService.getLocale(locationId)).currency
        : undefined;
      this.logger.log(
        `booking updated: id=${bookingId} locationId=${locationId} fields=${changes.map((change) => change.field).join(',')}`,
      );
      this.emitAudit({
        locationId,
        entityId: bookingId,
        eventType: AuditEvent.BOOKING_UPDATED,
        actionType: AuditActionType.MODIFY,
        actor,
        payload: { changes, ...(currency ? { currency } : {}) },
      });
    }

    return updated;
  }

  async updateStatus(
    locationId: string,
    bookingId: string,
    tokenPayload: TokenPayloadDto,
    dto: UpdateBookingStatusDto,
  ): Promise<BookingWithItems> {
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
    const old = await this.read.findByIdInLocation(locationId, bookingId);
    assertLocationRole(
      tokenPayload,
      old.locationId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
    const reversesCommission =
      old.status === BookingStatus.COMPLETED &&
      dto.status !== BookingStatus.COMPLETED;
    const reversalReason = reversesCommission
      ? this.optionalReason(dto.reason)
      : null;
    const actor = auditActorFromToken(tokenPayload, old.locationId);
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { id: bookingId },
        data: { status: dto.status },
        include: bookingWithItemsInclude,
      });
      if (
        dto.status === BookingStatus.COMPLETED &&
        old.status !== BookingStatus.COMPLETED
      ) {
        const order = await this.orders.syncCompletedBooking(result, actor, tx);
        await this.staffEarnings.recordForCompletedBooking(result, tx, order);
        await this.staffEarnings.syncForCompletedBooking(
          result,
          actor,
          tx,
          order,
        );
      } else if (reversesCommission) {
        await this.orders.reverseCompletedBookingServices(result, tx);
        await this.staffEarnings.reverseForBooking(
          result,
          reversalReason,
          actor,
          tx,
        );
      }
      return result;
    });
    this.logger.log(
      `booking status: id=${bookingId} locationId=${old.locationId} from=${old.status} to=${dto.status}`,
    );
    this.emitAudit({
      locationId: old.locationId,
      entityId: bookingId,
      eventType: AuditEvent.BOOKING_STATUS_CHANGED,
      actionType: AuditActionType.MODIFY,
      actor,
      payload: {
        from: old.status,
        to: dto.status,
        ...(reversalReason ? { reason: reversalReason } : {}),
      },
    });
    if (dto.status === BookingStatus.CONFIRMED && old.clientEmail) {
      const { timezone } = await this.locationService.getLocale(old.locationId);
      this.eventEmitter.emit(
        NOTIFICATION_EVENT,
        new BookingStatusChangedNotification(
          {
            ...this.notificationData(old),
            clientEmail: old.clientEmail,
            timezone,
          },
          'CONFIRMED',
          undefined,
        ),
      );
    }
    return updated;
  }

  async addProduct(
    locationId: string,
    bookingId: string,
    tokenPayload: TokenPayloadDto,
    dto: OrderProductItemDto,
  ): Promise<OrderWithItems> {
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
    const booking = await this.read.findByIdInLocation(locationId, bookingId);
    assertLocationRole(
      tokenPayload,
      booking.locationId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
    const actor = auditActorFromToken(tokenPayload, booking.locationId);
    return this.db.$transaction((tx) =>
      this.orders.addDraftProductToBookingOrder(booking, dto, actor, tx),
    );
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
      const updated = { ...booking, status: BookingStatus.COMPLETED };
      const didComplete = await this.db.$transaction(async (tx) => {
        const { count } = await tx.booking.updateMany({
          where: {
            id: booking.id,
            status: { in: [...AUTO_COMPLETABLE_STATUSES] },
            deletedAt: null,
          },
          data: { status: BookingStatus.COMPLETED },
        });
        if (count === 0) return false;
        const order = await this.orders.syncCompletedBooking(
          updated,
          actor,
          tx,
        );
        await this.staffEarnings.recordForCompletedBooking(updated, tx, order);
        await this.staffEarnings.syncForCompletedBooking(
          updated,
          actor,
          tx,
          order,
        );
        return true;
      });
      if (!didComplete) continue;
      this.emitAudit({
        locationId: booking.locationId,
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

  async cancel(
    locationId: string,
    bookingId: string,
    tokenPayload: TokenPayloadDto,
    cancelledBy: CancelledBy,
    dto: CancelBookingDto,
  ): Promise<Booking> {
    assertLocationRole(
      tokenPayload,
      locationId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
    const booking = await this.read.findByIdInLocation(locationId, bookingId);
    assertLocationRole(
      tokenPayload,
      booking.locationId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
    return this.executeCancellation(
      booking,
      cancelledBy,
      dto.reason,
      auditActorFromToken(tokenPayload, booking.locationId),
    );
  }

  async cancelByClient(
    bookingId: string,
    dto: CancelBookingDto,
  ): Promise<Booking> {
    const booking = await this.read.findById(bookingId);
    const actor: AuditActor = {
      name: `${booking.clientFirstName} ${booking.clientLastName}`,
      role: AuditActorRole.CLIENT,
    };
    return this.executeCancellation(
      booking,
      CancelledBy.CLIENT,
      dto.reason,
      actor,
    );
  }

  async delete(
    locationId: string,
    bookingId: string,
    tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    assertLocationRole(tokenPayload, locationId, BusinessRole.OWNER);
    const booking = await this.read.findByIdInLocation(locationId, bookingId);
    assertLocationRole(tokenPayload, booking.locationId, BusinessRole.OWNER);
    const actor = auditActorFromToken(tokenPayload, booking.locationId);
    await this.db.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { deletedAt: new Date() },
      });
      await this.calendarService.deleteBookingEvents(
        booking.items.flatMap((item) =>
          item.calendarEventId ? [item.calendarEventId] : [],
        ),
        tx,
      );
      if (booking.status === BookingStatus.COMPLETED) {
        await this.orders.reverseCompletedBookingServices(booking, tx);
        await this.staffEarnings.reverseForBooking(booking, null, actor, tx);
      }
    });
    this.logger.log(
      `booking deleted: id=${booking.id} locationId=${booking.locationId}`,
    );
    this.emitAudit({
      locationId: booking.locationId,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_DELETED,
      actionType: AuditActionType.DELETE,
      actor,
      payload: {
        serviceTitles: booking.items
          .map((item) => item.serviceTitle)
          .join(', '),
      },
    });
  }

  private optionalReason(reason?: string | null): string | null {
    const text = reason?.trim() ?? '';
    return text || null;
  }

  private async executeCancellation(
    booking: BookingWithItems,
    cancelledBy: CancelledBy,
    reason: string | undefined,
    actor: AuditActor,
  ): Promise<BookingWithItems> {
    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppException(
        ErrorCode.BOOKING_ALREADY_CANCELLED,
        HttpStatus.CONFLICT,
      );
    }
    const storedReason = this.optionalReason(reason);
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.booking.update({
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
        await this.orders.reverseCompletedBookingServices(result, tx);
        await this.staffEarnings.reverseForBooking(
          result,
          storedReason,
          actor,
          tx,
        );
      }
      return result;
    });
    this.logger.log(
      `booking cancelled: id=${booking.id} locationId=${booking.locationId} cancelledBy=${cancelledBy}`,
    );
    this.emitAudit({
      locationId: booking.locationId,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_CANCELLED,
      actionType: AuditActionType.MODIFY,
      actor,
      payload: { cancelledBy, reason: storedReason ?? undefined },
    });
    if (booking.clientEmail && cancelledBy === CancelledBy.STAFF) {
      const { timezone } = await this.locationService.getLocale(
        booking.locationId,
      );
      this.eventEmitter.emit(
        NOTIFICATION_EVENT,
        new BookingStatusChangedNotification(
          {
            ...this.notificationData(booking),
            clientEmail: booking.clientEmail,
            timezone,
          },
          'CANCELLED',
          storedReason ?? undefined,
        ),
      );
    }
    return updated;
  }

  private async updateWithSlotReschedule(
    old: BookingWithItems,
    locationId: string,
    dto: UpdateBookingDto,
    pricePatches: UpdateBookingItemPriceDto[],
    actor: AuditActor,
  ): Promise<BookingWithItems> {
    const business = await this.locationService.findById(locationId);
    if (old.items.length === 0) {
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    const newStartAt = dto.startAt
      ? TimeService.localToUtc(dto.startAt, business.timezone)
      : old.startAt;
    const deltaMs = newStartAt.getTime() - old.startAt.getTime();
    const targetStaffId = dto.staffId;
    const targetStaff = targetStaffId
      ? await this.staffService.findById(targetStaffId)
      : null;

    const movedItems = await Promise.all(
      old.items.map(async (item) => {
        const staffId = targetStaffId ?? item.staffId;
        if (targetStaffId) {
          const candidates = await this.staffService.resolveStaffForService(
            locationId,
            item.serviceId,
            targetStaffId,
          );
          if (candidates.length === 0) {
            throw new AppException(
              ErrorCode.BOOKING_STAFF_NOT_FOUND,
              HttpStatus.NOT_FOUND,
            );
          }
        }
        return {
          ...item,
          staffId,
          staffName: targetStaff?.name ?? item.staffName,
          startAt: new Date(item.startAt.getTime() + deltaMs),
          endAt: new Date(item.endAt.getTime() + deltaMs),
        };
      }),
    );
    const lockKeys = [
      ...new Set(
        movedItems.map(
          (item) =>
            `${item.staffId}:${TimeService.zonedDateStr(item.startAt, business.timezone)}`,
        ),
      ),
    ]
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
        const dateStr = TimeService.zonedDateStr(
          item.startAt,
          business.timezone,
        );
        const [shift, blockEvents] = await Promise.all([
          this.staffService.findShiftForDate(
            item.staffId,
            new Date(dateStr),
            tx,
          ),
          this.calendarService.listBlockingEvents(
            locationId,
            [item.staffId],
            item.startAt,
            item.endAt,
            item.calendarEventId ? [item.calendarEventId] : [],
            tx,
          ),
        ]);

        if (
          !this.calendarService.isSlotFree(
            item.staffId,
            dateStr,
            item.startAt,
            item.endAt,
            shift,
            blockEvents,
            business.timezone,
          )
        ) {
          this.logger.warn(
            `slot unavailable on update: bookingId=${old.id} staffId=${item.staffId} startAt=${item.startAt.toISOString()}`,
          );
          throw new AppException(
            ErrorCode.BOOKING_SLOT_UNAVAILABLE,
            HttpStatus.CONFLICT,
          );
        }
      }

      for (const item of movedItems) {
        const calendarEvent = await this.calendarService.saveBookingEvent(
          {
            eventId: item.calendarEventId,
            locationId,
            staffId: item.staffId,
            startAt: item.startAt,
            endAt: item.endAt,
          },
          tx,
        );
        await tx.bookingItem.update({
          where: { id: item.id },
          data: {
            staffId: item.staffId,
            staffName: item.staffName,
            startAt: item.startAt,
            endAt: item.endAt,
            calendarEventId: calendarEvent.id,
          },
        });
      }

      const updated = await tx.booking.update({
        where: { id: old.id },
        data: {
          startAt: new Date(
            Math.min(...movedItems.map((item) => item.startAt.getTime())),
          ),
          endAt: new Date(
            Math.max(...movedItems.map((item) => item.endAt.getTime())),
          ),
          clientFirstName: dto.firstName ?? old.clientFirstName,
          clientLastName: dto.lastName ?? old.clientLastName,
          clientPhone: dto.phone ?? old.clientPhone,
          clientEmail:
            dto.email !== undefined ? (dto.email ?? null) : old.clientEmail,
          notes: dto.notes !== undefined ? (dto.notes ?? null) : undefined,
          internalNotes:
            dto.internalNotes !== undefined
              ? (dto.internalNotes ?? null)
              : undefined,
          ...this.itemPriceWrite(pricePatches),
        },
        include: bookingWithItemsInclude,
      });
      if (old.status === BookingStatus.COMPLETED) {
        const order = await this.orders.syncCompletedBooking(
          updated,
          actor,
          tx,
        );
        await this.staffEarnings.syncForCompletedBooking(
          updated,
          actor,
          tx,
          order,
        );
      }
      return updated;
    });
  }

  private emitAudit(params: {
    locationId: string;
    entityId: string;
    eventType: AuditEvent;
    actionType: AuditActionType;
    actor: AuditActor;
    payload: Record<string, unknown>;
  }): void {
    const event: AuditLogEvent = {
      locationId: params.locationId,
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

  private pricePatches(
    old: BookingWithItems,
    dto: UpdateBookingDto,
  ): UpdateBookingItemPriceDto[] {
    const patches = dto.items ?? [];
    if (patches.length === 0) return [];
    const known = new Set(old.items.map((item) => item.id));
    for (const patch of patches) {
      if (!known.has(patch.id)) {
        throw new AppException(
          ErrorCode.BOOKING_ITEM_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
    }
    return patches;
  }

  private itemPriceWrite(patches: UpdateBookingItemPriceDto[]): {
    items?: Prisma.BookingUpdateInput['items'];
  } {
    if (patches.length === 0) return {};
    return {
      items: {
        update: patches.map((patch) => ({
          where: { id: patch.id },
          data: { customPrice: patch.customPrice },
        })),
      },
    };
  }

  private itemValueChanges(
    old: BookingWithItems,
    updated: BookingWithItems,
    field: string,
    read: (item: BookingWithItems['items'][number]) => string | null,
  ): AuditFieldChange[] {
    const nextById = new Map(updated.items.map((item) => [item.id, item]));
    const multiple = old.items.length > 1;
    const changes: AuditFieldChange[] = [];
    for (const item of old.items) {
      const next = nextById.get(item.id);
      if (!next) continue;
      const from = read(item);
      const to = read(next);
      if (from === to) continue;
      const text = (value: string | null) => {
        if (value == null) return '-';
        return multiple ? `${item.serviceTitle}: ${value}` : value;
      };
      changes.push({ field, from: text(from), to: text(to) });
    }
    return changes;
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
      staffName: [...new Set(booking.items.map((item) => item.staffName))].join(
        ', ',
      ),
      startAt: booking.startAt,
      endAt: booking.endAt,
    };
  }

  private buildLockKey(staffId: string, dateStr: string): bigint {
    const hash = createHash('sha256').update(`${staffId}:${dateStr}`).digest();
    return hash.readBigInt64BE(0);
  }
}
