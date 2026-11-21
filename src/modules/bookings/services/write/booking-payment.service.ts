import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { OrderWithItems } from '../../../orders/interfaces/order-with-items.interface.js';
import { OrderPaymentsFacade } from '../../../orders/order-payments.facade.js';
import { OrdersFacade } from '../../../orders/orders.facade.js';
import { assertVisitParticipant } from '../../../orders/rules/order-payment-correction.rules.js';
import { PaymentInputDto } from '../../../payments/dto/payment-input.dto.js';
import { PaymentChange } from '../../../payments/interfaces/payment-change.interface.js';
import { PaymentOperationWithPayments } from '../../../payments/interfaces/payment-operation-with-payments.interface.js';
import { PaymentsFacade } from '../../../payments/payments.facade.js';
import {
  defaultVisitPaymentDate,
  resolvePaymentDate,
} from '../../../payments/rules/payment-occurred-at.rules.js';
import { paymentRequestHash } from '../../../payments/rules/payment-request-hash.js';
import { paymentRequest } from '../../../payments/rules/payment-request.rules.js';
import { assertPaymentTrackingEnabled } from '../../../payments/rules/payment-tracking.rules.js';
import { bookingWithItemsInclude } from '../../constants/booking-with-items.include.js';
import { PayBookingDto } from '../../dto/pay-booking.dto.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { VisitPaymentOutcome } from '../../interfaces/visit-payment-outcome.interface.js';
import { VisitPaymentPlanInput } from '../../interfaces/visit-payment-plan-input.interface.js';
import { VisitPaymentResult } from '../../interfaces/visit-payment-result.interface.js';
import { VisitPaymentPlan } from '../../interfaces/visit-payment-plan.interface.js';
import {
  completesOnPayment,
  visitAmountDue,
} from '../../rules/visit-payment-due.rules.js';
import {
  assertProductsConfirmable,
  confirmsProducts,
  productItemIdsToConfirm,
} from '../../rules/visit-payment-step.rules.js';
import { BookingEventsService } from '../booking-events.service.js';
import { BookingLifecycleService } from './booking-lifecycle.service.js';

/**
 * Payment of a visit: completion of a started visit, confirmation of product lines and the
 * journal write, in one transaction. Lock order: payment key, booking, order, journal.
 * Nothing here runs on its own: only a person paying a visit records money.
 */
@Injectable()
export class BookingPaymentService {
  private readonly logger = new Logger(BookingPaymentService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly orders: OrdersFacade,
    private readonly orderPayments: OrderPaymentsFacade,
    private readonly payments: PaymentsFacade,
    private readonly lifecycle: BookingLifecycleService,
    private readonly events: BookingEventsService,
  ) {}

  /**
   * Validates the payment step of a booking write before any lock: payment tracking
   * (409 PAYMENT_TRACKING_DISABLED), split shape, expectations and explicit date. Null when
   * the write neither pays nor confirms products.
   */
  async plan(
    locationId: string,
    input: VisitPaymentPlanInput,
    canReplace: boolean,
  ): Promise<VisitPaymentPlan | null> {
    const products = {
      confirmProductItemIds: input.confirmProductItemIds ?? [],
      confirmAllDraftProducts: input.confirmAllDraftProducts === true,
    };
    if (!input.payment && !confirmsProducts(products)) return null;
    const now = new Date();
    const { timezone } = await this.locations.getLocale(locationId);
    const payment = input.payment
      ? await this.planPayment(locationId, input.payment, timezone, now)
      : null;
    return { ...products, payment, canReplace, timezone, now };
  }

  /**
   * PUT bookings/:id/payment. `participantStaffId` is set when the caller may pay only visits
   * they take part in; it is checked again on the locked booking, so a visit reassigned after
   * the controller read it cannot be paid by its former master.
   */
  async pay(
    booking: BookingWithItems,
    dto: PayBookingDto,
    actor: AuditActor,
    canReplace: boolean,
    participantStaffId?: string,
  ): Promise<VisitPaymentResult> {
    const plan = (await this.plan(
      booking.locationId,
      { payment: dto, confirmProductItemIds: dto.confirmProductItemIds },
      canReplace,
    ))!;
    const result = await this.db.$transaction(
      async (tx) => {
        const replay = await this.lockForBooking(tx, booking, plan);
        if (replay) return { replay, outcome: null };
        const outcome = await this.payLocked(
          tx,
          booking,
          plan,
          actor,
          participantStaffId,
        );
        return { replay: null, outcome };
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
    if (result.replay)
      return { orderId: result.replay.orderId, operationId: result.replay.id };
    const outcome = result.outcome!;
    await this.publish(outcome, actor);
    return { orderId: outcome.order!.id, operationId: outcome.operationId! };
  }

  /**
   * First step of a write on an existing booking: locks the payment key and returns the
   * operation of an earlier identical request, which skips the whole step.
   */
  async lockForBooking(
    tx: Prisma.TransactionClient,
    booking: Pick<BookingWithItems, 'id' | 'locationId'>,
    plan: VisitPaymentPlan,
  ): Promise<PaymentOperationWithPayments | null> {
    if (!plan.payment) return null;
    return this.payments.lockKeyForReplay(
      tx,
      booking.locationId,
      plan.payment.input.idempotencyKey,
      this.requestHash(booking.id, plan),
    );
  }

  /**
   * First step of a manual creation: locks the payment key, which no earlier request may
   * have used, since the booking is new.
   */
  async lockForNewBooking(
    tx: Prisma.TransactionClient,
    locationId: string,
    plan: VisitPaymentPlan,
  ): Promise<void> {
    if (!plan.payment) return;
    await this.payments.lockUnusedKey(
      tx,
      locationId,
      plan.payment.input.idempotencyKey,
    );
  }

  /**
   * Runs the step on a booking that this transaction has locked (or created) and saved:
   * completes a started PENDING or CONFIRMED visit when it is paid, confirms product lines,
   * then records or replaces the payment for the amount due computed under the order lock.
   */
  async applyLocked(
    tx: Prisma.TransactionClient,
    booking: BookingWithItems,
    plan: VisitPaymentPlan,
    actor: AuditActor,
  ): Promise<VisitPaymentOutcome> {
    assertProductsConfirmable(booking, plan);
    const completes = !!plan.payment && completesOnPayment(booking, plan.now);
    const current = completes
      ? await this.lifecycle.completeInTransaction(booking, actor, tx)
      : booking;
    const locked = await this.orders.lockBookingOrder(current, actor, tx);
    const confirmedItemIds = productItemIdsToConfirm(plan, locked.items);
    const order =
      confirmedItemIds.length > 0
        ? await this.orders.confirmBookingProducts(
            locked,
            confirmedItemIds,
            tx,
            plan.now,
          )
        : locked;
    const change = await this.recordPayment(tx, current, order, plan, actor);
    return {
      booking: current,
      completedFrom: completes ? (booking.status as BookingStatus) : null,
      order,
      confirmedItemIds,
      change,
      operationId: change?.operation.id ?? null,
    };
  }

  /**
   * Undoes a first payment of the visit that the actor has just recorded. The visit keeps its
   * status: it has started, and the cron would complete it anyway. `participantStaffId` is
   * checked again on the locked booking, as in `pay`.
   */
  undo(
    booking: Pick<BookingWithItems, 'id' | 'locationId'>,
    operationId: string,
    actor: AuditActor,
    now: Date,
    participantStaffId?: string,
  ): Promise<void> {
    return this.orderPayments.undoVisitPayment({
      locationId: booking.locationId,
      bookingId: booking.id,
      operationId,
      actor,
      now,
      participantStaffId,
    });
  }

  /** Audit of the step. Call after commit. */
  async publish(
    outcome: VisitPaymentOutcome,
    actor: AuditActor,
  ): Promise<void> {
    if (outcome.completedFrom)
      this.publishCompleted(outcome.booking, outcome.completedFrom, actor);
    if (outcome.order && outcome.confirmedItemIds.length > 0)
      await this.orders.recordProductsConfirmed(
        outcome.order,
        outcome.confirmedItemIds,
        actor,
      );
    if (outcome.change)
      this.payments.publish(outcome.change, actor, outcome.booking.id);
  }

  /** The payment of the step, validated: tracking enabled, split, expectations, date. */
  private async planPayment(
    locationId: string,
    input: PaymentInputDto,
    timezone: string,
    now: Date,
  ): Promise<NonNullable<VisitPaymentPlan['payment']>> {
    // Fails fast before any lock; PaymentsFacade.record checks again under the locks.
    assertPaymentTrackingEnabled(
      await this.locations.getPaymentTracking(locationId),
    );
    return {
      input,
      request: paymentRequest(
        input,
        resolvePaymentDate(input.occurredAt, timezone, now),
      ),
    };
  }

  /** `pay` after the key lock: locks the booking and checks the participant again. */
  private async payLocked(
    tx: Prisma.TransactionClient,
    booking: Pick<BookingWithItems, 'id' | 'locationId'>,
    plan: VisitPaymentPlan,
    actor: AuditActor,
    participantStaffId: string | undefined,
  ): Promise<VisitPaymentOutcome> {
    const locked = await this.lockBooking(tx, booking.locationId, booking.id);
    assertVisitParticipant(
      { staffIds: locked.items.map((item) => item.staffId) },
      participantStaffId,
    );
    return this.applyLocked(tx, locked, plan, actor);
  }

  /** Records or replaces the payment for the amount due under the order lock; null without one. */
  private async recordPayment(
    tx: Prisma.TransactionClient,
    booking: BookingWithItems,
    order: OrderWithItems,
    plan: VisitPaymentPlan,
    actor: AuditActor,
  ): Promise<PaymentChange | null> {
    if (!plan.payment) return null;
    return this.payments.record(tx, {
      locationId: booking.locationId,
      orderId: order.id,
      currency: order.currency,
      amountDue: visitAmountDue(booking, this.orders.productsNet(order)),
      request: plan.payment.request,
      defaultOccurredAt: defaultVisitPaymentDate(
        booking.startAt,
        plan.now,
        plan.timezone,
      ),
      idempotencyKey: plan.payment.input.idempotencyKey,
      requestHash: this.requestHash(booking.id, plan),
      actor,
      canReplace: plan.canReplace,
    });
  }

  private publishCompleted(
    booking: BookingWithItems,
    from: BookingStatus,
    actor: AuditActor,
  ): void {
    this.logger.log(
      `booking status: id=${booking.id} locationId=${booking.locationId} from=${from} to=${BookingStatus.COMPLETED} (payment)`,
    );
    this.events.audit({
      locationId: booking.locationId,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_STATUS_CHANGED,
      actionType: AuditActionType.MODIFY,
      actor,
      payload: { from, to: BookingStatus.COMPLETED },
    });
  }

  /** Locks a booking that is not deleted and reads it again under the lock. */
  private async lockBooking(
    tx: Prisma.TransactionClient,
    locationId: string,
    bookingId: string,
  ): Promise<BookingWithItems> {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} AND "locationId" = ${locationId} AND "deletedAt" IS NULL FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Booking not found');
    return tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: bookingWithItemsInclude,
    });
  }

  private requestHash(bookingId: string, plan: VisitPaymentPlan): string {
    return paymentRequestHash(
      { bookingId },
      plan.payment!.input,
      plan.confirmAllDraftProducts
        ? ['ALL_DRAFT_PRODUCTS']
        : plan.confirmProductItemIds,
    );
  }
}
