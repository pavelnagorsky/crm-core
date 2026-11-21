import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { AUDIT_EVENT } from '../audit/constants/audit.constants.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { LocationService } from '../location/services/location.service.js';
import { PaymentChangeKind } from './enums/payment-change-kind.enum.js';
import { OrderPaymentTotals } from './interfaces/order-payment-totals.interface.js';
import { PaymentChange } from './interfaces/payment-change.interface.js';
import { PaymentCommand } from './interfaces/payment-command.interface.js';
import { PaymentOperationWithPayments } from './interfaces/payment-operation-with-payments.interface.js';
import { RefundCommand } from './interfaces/refund-command.interface.js';
import { UndoPaymentCommand } from './interfaces/undo-payment-command.interface.js';
import { VoidPaymentCommand } from './interfaces/void-payment-command.interface.js';
import { PaymentLedgerService } from './services/payment-ledger.service.js';
import { PaymentReadService } from './services/payment-read.service.js';
import { paymentAuditPayload } from './rules/payment-audit.rules.js';
import { assertPaymentTrackingEnabled } from './rules/payment-tracking.rules.js';

const AUDIT_EVENT_BY_CHANGE: Record<PaymentChangeKind, AuditEvent> = {
  [PaymentChangeKind.RECORDED]: AuditEvent.PAYMENT_RECORDED,
  [PaymentChangeKind.REPLACED]: AuditEvent.PAYMENT_REPLACED,
  [PaymentChangeKind.VOIDED]: AuditEvent.PAYMENT_VOIDED,
  [PaymentChangeKind.REFUNDED]: AuditEvent.PAYMENT_REFUNDED,
};

/**
 * Money journal of orders. An order id is an opaque reference here; the caller passes the
 * currency and the amount due. Write methods take the caller's transaction and require the
 * caller to hold the order lock. Lock order: payment key, booking, order, journal.
 */
@Injectable()
export class PaymentsFacade {
  constructor(
    private readonly ledger: PaymentLedgerService,
    private readonly reads: PaymentReadService,
    private readonly locations: LocationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * First step of a keyed payment action: locks the key and returns the operation of an
   * earlier identical request (a retry), which skips the action. Another request with the
   * key: 409 PAYMENT_IDEMPOTENCY_CONFLICT.
   */
  async lockKeyForReplay(
    tx: Prisma.TransactionClient,
    locationId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<PaymentOperationWithPayments | null> {
    await this.ledger.lockKey(tx, locationId, idempotencyKey);
    return this.ledger.findReplay(tx, locationId, idempotencyKey, requestHash);
  }

  /**
   * First step of a payment of something created in the same request: locks the key, which
   * no earlier request may have used (409 PAYMENT_IDEMPOTENCY_CONFLICT).
   */
  async lockUnusedKey(
    tx: Prisma.TransactionClient,
    locationId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.ledger.lockKey(tx, locationId, idempotencyKey);
    await this.ledger.assertKeyUnused(tx, locationId, idempotencyKey);
  }

  findOperation(
    tx: Prisma.TransactionClient,
    locationId: string,
    orderId: string,
    operationId: string,
  ): Promise<PaymentOperationWithPayments | null> {
    return this.ledger.findOperation(tx, locationId, orderId, operationId);
  }

  /**
   * The single entry of new payments: 409 PAYMENT_TRACKING_DISABLED when the location does not
   * track payments, which rolls the caller's whole write back. Refunds, voids and undos stay
   * allowed: they fix money already on record.
   */
  async record(
    tx: Prisma.TransactionClient,
    command: PaymentCommand,
  ): Promise<PaymentChange> {
    assertPaymentTrackingEnabled(
      await this.locations.getPaymentTracking(command.locationId),
    );
    return this.ledger.record(tx, command);
  }

  refund(
    tx: Prisma.TransactionClient,
    command: RefundCommand,
  ): Promise<PaymentChange> {
    return this.ledger.refund(tx, command);
  }

  void(
    tx: Prisma.TransactionClient,
    command: VoidPaymentCommand,
    currency: string,
  ): Promise<PaymentChange | null> {
    return this.ledger.void(tx, command, currency);
  }

  /** Undo of a first payment by its author within minutes. Null when nothing is active. */
  undo(
    tx: Prisma.TransactionClient,
    command: UndoPaymentCommand,
    currency: string,
  ): Promise<PaymentChange | null> {
    return this.ledger.undo(tx, command, currency);
  }

  paidAmount(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<Prisma.Decimal> {
    return this.ledger.paidAmount(tx, orderId);
  }

  hasOperations(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<boolean> {
    return this.ledger.hasOperations(tx, orderId);
  }

  totalsByOrders(
    orderIds: readonly string[],
    client?: Prisma.TransactionClient,
  ): Promise<Map<string, OrderPaymentTotals>> {
    return this.reads.totalsByOrders(orderIds, client);
  }

  /** Order history entry of a journal write. Call after commit. */
  publish(
    change: PaymentChange,
    actor: AuditActor,
    bookingId: string | null = null,
  ): void {
    this.eventEmitter.emit(AUDIT_EVENT, {
      locationId: change.locationId,
      entityType: AuditEntity.ORDER,
      entityId: change.orderId,
      eventType: AUDIT_EVENT_BY_CHANGE[change.kind],
      actionType: AuditActionType.ACTION,
      occurredAt: new Date(),
      actor,
      payload: paymentAuditPayload(change, bookingId),
    } satisfies AuditLogEvent);
  }
}
