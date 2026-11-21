import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { LocationService } from '../../location/services/location.service.js';
import { PaymentInputDto } from '../../payments/dto/payment-input.dto.js';
import { RefundInputDto } from '../../payments/dto/refund-input.dto.js';
import { PaymentChange } from '../../payments/interfaces/payment-change.interface.js';
import { PaymentIntentInput } from '../../payments/interfaces/payment-intent-input.interface.js';
import { PaymentRequest } from '../../payments/interfaces/payment-request.interface.js';
import { PaymentsFacade } from '../../payments/payments.facade.js';
import {
  defaultSalePaymentDate,
  resolvePaymentDate,
} from '../../payments/rules/payment-occurred-at.rules.js';
import {
  paymentRequestHash,
  refundRequestHash,
} from '../../payments/rules/payment-request-hash.js';
import { paymentRequest } from '../../payments/rules/payment-request.rules.js';
import { assertPaymentTrackingEnabled } from '../../payments/rules/payment-tracking.rules.js';
import { OrderPaymentResult } from '../interfaces/order-payment-result.interface.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { orderAmountDue } from '../rules/order-payment-due.rules.js';
import { OrderStateRules } from '../rules/order-state.rules.js';
import { OrderLockService } from './order-lock.service.js';
import { OrderPersistenceService } from './order-persistence.service.js';

/** Payments and refunds through the order endpoints; corrections are in OrderPaymentCorrectionService. */
@Injectable()
export class OrderPaymentService {
  constructor(
    private readonly locations: LocationService,
    private readonly persistence: OrderPersistenceService,
    private readonly payments: PaymentsFacade,
    private readonly stateAssertions: OrderStateRules,
    private readonly locks: OrderLockService,
  ) {}

  /**
   * Validates a payment before any lock: payment tracking (409 PAYMENT_TRACKING_DISABLED),
   * split shape, expectations and explicit date. Returns the request with the date in UTC.
   */
  async prepareRequest(
    locationId: string,
    details: PaymentIntentInput,
    now: Date,
  ): Promise<PaymentRequest> {
    // Fails fast before any lock; PaymentsFacade.record checks again under the locks.
    assertPaymentTrackingEnabled(
      await this.locations.getPaymentTracking(locationId),
    );
    const occurredAt = details.occurredAt
      ? resolvePaymentDate(
          details.occurredAt,
          (await this.locations.getLocale(locationId)).timezone,
          now,
        )
      : null;
    return paymentRequest(details, occurredAt);
  }

  /** Records or replaces the payment of a sale. A visit order is paid through its booking. */
  async recordSalePayment(
    locationId: string,
    orderId: string,
    dto: PaymentInputDto,
    actor: AuditActor,
  ): Promise<OrderPaymentResult> {
    const now = new Date();
    const request = await this.prepareRequest(locationId, dto, now);
    const requestHash = paymentRequestHash({ orderId }, dto);
    return this.persistence.inTransaction(async (tx) => {
      await this.payments.lockKey(tx, locationId, dto.idempotencyKey);
      const replay = await this.payments.findReplay(
        tx,
        locationId,
        dto.idempotencyKey,
        requestHash,
      );
      if (replay)
        return { operationId: replay.id, change: null, bookingId: null };
      await this.persistence.lockOrder(tx, orderId);
      const order = await this.persistence.findInTransaction(
        tx,
        locationId,
        orderId,
      );
      const change = await this.recordInLockedSale(
        tx,
        order,
        request,
        dto.idempotencyKey,
        requestHash,
        actor,
        now,
      );
      return { operationId: change.operation.id, change, bookingId: null };
    });
  }

  /**
   * Payment of a locked sale inside another keyed order operation (immediate sale, group
   * confirmation): the parent key guards retries, so no key lock or replay check here.
   */
  async recordInLockedSale(
    tx: Prisma.TransactionClient,
    order: OrderWithItems,
    request: PaymentRequest,
    idempotencyKey: string,
    requestHash: string,
    actor: AuditActor,
    now = new Date(),
  ): Promise<PaymentChange> {
    this.assertSale(order);
    this.stateAssertions.assertActive(order.status);
    const { timezone } = await this.locations.getLocale(order.locationId);
    return this.payments.record(tx, {
      locationId: order.locationId,
      orderId: order.id,
      currency: order.currency,
      amountDue: orderAmountDue(order),
      request,
      defaultOccurredAt: defaultSalePaymentDate(
        order.occurredAt,
        now,
        timezone,
      ),
      idempotencyKey,
      requestHash,
      actor,
      canReplace: true,
    });
  }

  /** 409 ORDER_PAYMENT_VIA_BOOKING for a visit order: its amount due depends on the booking. */
  assertSale(order: Pick<OrderWithItems, 'bookingId'>): void {
    if (order.bookingId)
      throw new AppException(
        ErrorCode.ORDER_PAYMENT_VIA_BOOKING,
        HttpStatus.CONFLICT,
      );
  }

  /** Gives money back for any order, visit orders included. */
  async refund(
    locationId: string,
    orderId: string,
    dto: RefundInputDto,
    actor: AuditActor,
  ): Promise<OrderPaymentResult> {
    const now = new Date();
    const occurredAt = dto.occurredAt
      ? resolvePaymentDate(
          dto.occurredAt,
          (await this.locations.getLocale(locationId)).timezone,
          now,
        )!
      : now;
    const requestHash = refundRequestHash(orderId, dto);
    return this.persistence.inTransaction(async (tx) => {
      await this.payments.lockKey(tx, locationId, dto.idempotencyKey);
      const replay = await this.payments.findReplay(
        tx,
        locationId,
        dto.idempotencyKey,
        requestHash,
      );
      if (replay)
        return { operationId: replay.id, change: null, bookingId: null };
      const { order } = await this.locks.lockOrderWithVisit(
        tx,
        locationId,
        orderId,
      );
      const change = await this.payments.refund(tx, {
        locationId,
        orderId,
        currency: order.currency,
        method: dto.method,
        amount: MoneyUtils.decimal(dto.amount),
        occurredAt,
        reason: dto.reason || null,
        idempotencyKey: dto.idempotencyKey,
        requestHash,
        orderReturnId: null,
        actor,
      });
      return {
        operationId: change.operation.id,
        change,
        bookingId: order.bookingId,
      };
    });
  }

  /** Order history entry of a journal write. Call after commit. */
  publish(
    change: PaymentChange | null | undefined,
    actor: AuditActor,
    bookingId: string | null = null,
  ): void {
    if (change) this.payments.publish(change, actor, bookingId);
  }

  /** 409 ORDER_HAS_PAYMENTS while money of the order is on record. The order is locked. */
  async assertNothingPaid(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    if ((await this.payments.paidAmount(tx, orderId)).gt(0))
      throw new AppException(ErrorCode.ORDER_HAS_PAYMENTS, HttpStatus.CONFLICT);
  }
}
