import { HttpStatus, Injectable } from '@nestjs/common';
import { Booking, CancelledBy, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AddOrderItemsDto } from '../../../orders/dto/add-order-items.dto.js';
import { OrderProductItemDto } from '../../../orders/dto/order-product-item.dto.js';
import { OrderWithItems } from '../../../orders/interfaces/order-with-items.interface.js';
import { OrdersFacade } from '../../../orders/orders.facade.js';
import { StaffEarningsService } from '../../../payroll/earnings/services/staff-earnings.service.js';
import { bookingWithItemsInclude } from '../../constants/booking-with-items.include.js';
import { CancelBookingDto } from '../../dto/cancel-booking.dto.js';
import { UpdateBookingItemPriceDto } from '../../dto/update-booking-item-price.dto.js';
import { UpdateBookingStatusDto } from '../../dto/update-booking-status.dto.js';
import { UpdateBookingDto } from '../../dto/update-booking.dto.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { BookingSource } from '../../enums/booking-source.enum.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { BookingWriteHooks } from '../../interfaces/booking-write-hooks.interface.js';
import { VisitPaymentOutcome } from '../../interfaces/visit-payment-outcome.interface.js';
import { PaymentOperationWithPayments } from '../../../payments/interfaces/payment-operation-with-payments.interface.js';
import { BookingEventsService } from '../booking-events.service.js';
import { BookingWriteLockService } from '../booking-write-lock.service.js';
import { BookingReadService } from '../read/booking-read.service.js';
import {
  BookingClientLink,
  BookingClientLinkService,
} from './booking-client-link.service.js';
import { BookingLifecycleService } from './booking-lifecycle.service.js';
import { BookingPaymentService } from './booking-payment.service.js';
import { BookingRescheduleService } from './booking-reschedule.service.js';

@Injectable()
export class BookingMutationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly staffEarnings: StaffEarningsService,
    private readonly orders: OrdersFacade,
    private readonly read: BookingReadService,
    private readonly write: BookingWriteLockService,
    private readonly events: BookingEventsService,
    private readonly lifecycle: BookingLifecycleService,
    private readonly reschedule: BookingRescheduleService,
    private readonly clientLink: BookingClientLinkService,
    private readonly bookingPayment: BookingPaymentService,
  ) {}

  async update(
    old: BookingWithItems,
    actor: AuditActor,
    dto: UpdateBookingDto,
    canReplacePayment = false,
  ): Promise<BookingWithItems> {
    const bookingId = old.id;
    if (dto.isCustomTime === true && old.source !== BookingSource.MANUAL)
      throw new AppException(
        ErrorCode.BOOKING_CUSTOM_TIME_MANUAL_ONLY,
        HttpStatus.BAD_REQUEST,
      );

    const manualIntervalChanging = dto.endAt !== undefined;
    const slotChanging =
      dto.startAt !== undefined ||
      dto.staffId !== undefined ||
      Boolean(dto.staffAssignments?.length);
    const pricePatches = this.pricePatches(old, dto);
    const clientLink = await this.clientLink.resolve(old, dto);
    // Confirming products and paying come after the edit, in the same transaction.
    const paymentPlan = await this.bookingPayment.plan(
      old.locationId,
      {
        payment: dto.payment,
        confirmProductItemIds: dto.confirmProductItemIds,
      },
      canReplacePayment,
    );
    const updateArgs = {
      where: { id: bookingId },
      data: {
        isCustomTime: dto.isCustomTime ?? undefined,
        ...(clientLink
          ? this.clientLinkWrite(clientLink)
          : {
              clientFirstName: dto.firstName ?? old.clientFirstName,
              clientLastName: dto.lastName ?? old.clientLastName,
              clientPhone: dto.phone ?? old.clientPhone,
              clientEmail:
                dto.email !== undefined ? (dto.email ?? null) : old.clientEmail,
            }),
        notes: dto.notes !== undefined ? (dto.notes ?? null) : undefined,
        internalNotes:
          dto.internalNotes !== undefined
            ? (dto.internalNotes ?? null)
            : undefined,
        ...this.itemPriceWrite(pricePatches),
      },
      include: bookingWithItemsInclude,
    } satisfies Prisma.BookingUpdateArgs;
    // A booking order follows the client the booking is moved to.
    const payment: {
      replay: PaymentOperationWithPayments | null;
      outcome: VisitPaymentOutcome | null;
    } = { replay: null, outcome: null };
    const hooks: BookingWriteHooks = {
      beforeLock: paymentPlan
        ? async (tx) => {
            payment.replay = await this.bookingPayment.lockForBooking(
              tx,
              old,
              paymentPlan,
            );
          }
        : undefined,
      afterUpdate: async (booking, tx) => {
        if (clientLink) await this.orders.syncBookingClient(booking, tx);
        // A retry of the same payment has done its step already.
        if (paymentPlan && !payment.replay)
          payment.outcome = await this.bookingPayment.applyLocked(
            tx,
            booking,
            paymentPlan,
            actor,
          );
      },
    };
    let updated: BookingWithItems;
    if (manualIntervalChanging || slotChanging) {
      updated = await this.reschedule.reschedule(
        old,
        dto,
        updateArgs.data,
        actor,
        hooks,
      );
    } else {
      updated = await this.db.$transaction(
        async (tx) => {
          await hooks.beforeLock?.(tx);
          await this.write.lockUnchangedBooking(tx, old);
          const result = await tx.booking.update(updateArgs);
          if (
            old.status === BookingStatus.COMPLETED &&
            pricePatches.length > 0
          ) {
            const order = await this.orders.syncCompletedBooking(
              result,
              actor,
              tx,
            );
            await this.staffEarnings.syncForCompletedBooking(
              result,
              actor,
              tx,
              order,
            );
          }
          await hooks.afterUpdate?.(result, tx);
          return result;
          // The hooks may complete, sell and pay the visit in the same transaction.
        },
        { maxWait: 5_000, timeout: 30_000 },
      );
    }

    await this.events.updated(old, updated, actor);
    if (payment.outcome)
      await this.bookingPayment.publish(payment.outcome, actor);

    return payment.outcome?.booking ?? updated;
  }

  async addProduct(
    locationId: string,
    bookingId: string,
    actor: AuditActor,
    dto: OrderProductItemDto,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    return this.addProducts(
      locationId,
      bookingId,
      actor,
      { items: [dto] },
      canOverridePrice,
    );
  }

  async addProducts(
    locationId: string,
    bookingId: string,
    actor: AuditActor,
    dto: AddOrderItemsDto,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    const booking = await this.read.findByIdInLocation(locationId, bookingId);
    const added = await this.db.$transaction((tx) =>
      this.orders.addDraftProductsToBookingOrder(
        booking,
        dto.items,
        actor,
        tx,
        canOverridePrice,
      ),
    );
    this.orders.publishDraftProductsAdded(added, actor);
    return added.order;
  }

  updateStatus(
    old: BookingWithItems,
    actor: AuditActor,
    dto: UpdateBookingStatusDto,
  ): Promise<BookingWithItems> {
    return this.lifecycle.updateStatus(old, actor, dto);
  }

  completeElapsed(now = new Date()): Promise<number> {
    return this.lifecycle.completeElapsed(now);
  }

  cancel(
    booking: BookingWithItems,
    actor: AuditActor,
    cancelledBy: CancelledBy,
    dto: CancelBookingDto,
  ): Promise<Booking> {
    return this.lifecycle.cancel(booking, actor, cancelledBy, dto);
  }

  delete(booking: BookingWithItems, actor: AuditActor): Promise<void> {
    return this.lifecycle.delete(booking, actor);
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

  private clientLinkWrite(
    link: BookingClientLink,
  ): Pick<
    Prisma.BookingUpdateInput,
    | 'client'
    | 'clientFirstName'
    | 'clientLastName'
    | 'clientPhone'
    | 'clientEmail'
  > {
    return {
      client: link.clientId
        ? { connect: { id: link.clientId } }
        : { disconnect: true },
      clientFirstName: link.clientFirstName,
      clientLastName: link.clientLastName,
      clientPhone: link.clientPhone,
      clientEmail: link.clientEmail,
    };
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
}
