import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Booking, CancelledBy } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import {
  ACTIVE_LOCATION_WHERE,
  automaticProcessingLocationWhere,
} from '../../../../shared/database/active-business.where.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditActorRole } from '../../../audit/enums/audit-actor-role.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { CalendarFacade } from '../../../calendar/calendar.facade.js';
import { LocationService } from '../../../location/services/location.service.js';
import { OrdersFacade } from '../../../orders/orders.facade.js';
import { StaffEarningsService } from '../../../payroll/earnings/services/staff-earnings.service.js';
import { bookingWithItemsInclude } from '../../constants/booking-with-items.include.js';
import { CancelBookingDto } from '../../dto/cancel-booking.dto.js';
import { UpdateBookingStatusDto } from '../../dto/update-booking-status.dto.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { AUTO_COMPLETABLE_STATUSES } from '../../rules/booking-cron.rules.js';
import { BookingEventsService } from '../booking-events.service.js';
import { BookingWriteLockService } from '../booking-write-lock.service.js';
import { BookingReadService } from '../read/booking-read.service.js';
import { BookingRescheduleService } from './booking-reschedule.service.js';

@Injectable()
export class BookingLifecycleService {
  private readonly logger = new Logger(BookingLifecycleService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly calendar: CalendarFacade,
    private readonly locationService: LocationService,
    private readonly staffEarnings: StaffEarningsService,
    private readonly orders: OrdersFacade,
    private readonly read: BookingReadService,
    private readonly write: BookingWriteLockService,
    private readonly events: BookingEventsService,
    private readonly reschedule: BookingRescheduleService,
  ) {}

  async updateStatus(
    old: BookingWithItems,
    actor: AuditActor,
    dto: UpdateBookingStatusDto,
  ): Promise<BookingWithItems> {
    const { locationId, id: bookingId } = old;
    const reversesCommission =
      old.status === BookingStatus.COMPLETED &&
      dto.status !== BookingStatus.COMPLETED;
    const reversalReason = reversesCommission
      ? this.optionalReason(dto.reason)
      : null;
    const updated = await this.db.$transaction(async (tx) => {
      await this.write.lockUnchangedBooking(tx, old);
      if (AUTO_COMPLETABLE_STATUSES.includes(dto.status)) {
        await this.write.lockActiveLocation(locationId, tx);
        if (old.status === BookingStatus.CANCELLED) {
          await this.reschedule.restoreBookingEvents(old, tx);
        }
      }
      const result = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: dto.status,
          ...(old.status === BookingStatus.CANCELLED
            ? { cancelledAt: null, cancelledBy: null, cancellationReason: null }
            : {}),
        },
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
    this.events.audit({
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
    if (dto.status === BookingStatus.CONFIRMED)
      await this.events.notifyStatus(old, 'CONFIRMED');
    return updated;
  }

  async completeElapsed(now = new Date()): Promise<number> {
    const due = await this.db.booking.findMany({
      where: {
        endAt: { lte: now },
        status: { in: [...AUTO_COMPLETABLE_STATUSES] },
        deletedAt: null,
        location: ACTIVE_LOCATION_WHERE,
      },
      include: bookingWithItemsInclude,
    });

    const cutoffs = await this.locationService.getAutomaticProcessingCutoffs([
      ...new Set(due.map((booking) => booking.locationId)),
    ]);
    let completed = 0;
    const actor: AuditActor = { name: 'System', role: AuditActorRole.SYSTEM };

    for (const booking of due) {
      if (!cutoffs.has(booking.locationId)) continue;
      const cutoff = cutoffs.get(booking.locationId);
      if (cutoff && booking.startAt <= cutoff) continue;
      const updated = { ...booking, status: BookingStatus.COMPLETED };
      const didComplete = await this.db.$transaction(async (tx) => {
        if (
          !(await this.locationService.acquireActiveOperationLock(
            booking.locationId,
            tx,
          ))
        )
          return false;
        const { count } = await tx.booking.updateMany({
          where: {
            id: booking.id,
            status: { in: [...AUTO_COMPLETABLE_STATUSES] },
            deletedAt: null,
            updatedAt: booking.updatedAt,
            endAt: { lte: now },
            location: automaticProcessingLocationWhere(booking.startAt),
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
      this.events.audit({
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
    booking: BookingWithItems,
    actor: AuditActor,
    cancelledBy: CancelledBy,
    dto: CancelBookingDto,
  ): Promise<Booking> {
    return this.executeCancellation(booking, cancelledBy, dto.reason, actor);
  }

  async cancelByClient(
    bookingId: string,
    dto: CancelBookingDto,
  ): Promise<Booking> {
    const booking = await this.read.findById(bookingId);
    if (booking.status === BookingStatus.COMPLETED)
      throw new ForbiddenException(
        'Completed bookings cannot be cancelled with a client token',
      );
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

  async delete(booking: BookingWithItems, actor: AuditActor): Promise<void> {
    let removedDraftProductItems: Record<string, unknown>[] = [];
    await this.db.$transaction(async (tx) => {
      await this.write.lockUnchangedBooking(tx, booking);
      await tx.booking.update({
        where: { id: booking.id },
        data: { deletedAt: new Date() },
      });
      await this.calendar.deleteBookingEvents(
        booking.items.flatMap((item) =>
          item.calendarEventId ? [item.calendarEventId] : [],
        ),
        tx,
      );
      if (booking.status === BookingStatus.COMPLETED) {
        await this.orders.reverseCompletedBookingServices(booking, tx);
        await this.staffEarnings.reverseForBooking(booking, null, actor, tx);
      } else {
        removedDraftProductItems =
          await this.orders.removeDraftProductsForBooking(booking, tx);
      }
    });
    this.events.audit({
      locationId: booking.locationId,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_DELETED,
      actionType: AuditActionType.DELETE,
      actor,
      payload: {
        serviceTitles: booking.items
          .map((item) => item.serviceTitle)
          .join(', '),
        removedDraftProductItems,
      },
    });
    this.logger.log(
      `booking deleted: id=${booking.id} locationId=${booking.locationId}`,
    );
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
    let removedDraftProductItems: Record<string, unknown>[] = [];
    const updated = await this.db.$transaction(async (tx) => {
      await this.write.lockUnchangedBooking(tx, booking);
      const result = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledBy,
          cancelledAt: new Date(),
          cancellationReason: storedReason,
          items: { updateMany: { where: {}, data: { calendarEventId: null } } },
        },
        include: bookingWithItemsInclude,
      });
      await this.calendar.deleteBookingEvents(
        booking.items.flatMap((item) =>
          item.calendarEventId ? [item.calendarEventId] : [],
        ),
        tx,
      );
      if (booking.status === BookingStatus.COMPLETED) {
        await this.orders.reverseCompletedBookingServices(result, tx);
        await this.staffEarnings.reverseForBooking(
          result,
          storedReason,
          actor,
          tx,
        );
      } else {
        removedDraftProductItems =
          await this.orders.removeDraftProductsForBooking(result, tx);
      }
      return result;
    });
    this.events.audit({
      locationId: booking.locationId,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_CANCELLED,
      actionType: AuditActionType.MODIFY,
      actor,
      payload: {
        cancelledBy,
        reason: storedReason ?? undefined,
        removedDraftProductItems,
      },
    });
    this.logger.log(
      `booking cancelled: id=${booking.id} locationId=${booking.locationId} cancelledBy=${cancelledBy}`,
    );
    if (cancelledBy === CancelledBy.STAFF)
      await this.events.notifyStatus(
        booking,
        'CANCELLED',
        storedReason ?? undefined,
      );
    return updated;
  }
}
