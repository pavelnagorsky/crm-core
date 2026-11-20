import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { MoneyUtils } from '../../shared/money/money.utils.js';
import { AUDIT_EVENT } from '../audit/constants/audit.constants.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { PaymentAuditPayload } from '../audit/interfaces/payment-audit-payload.interface.js';
import { PaymentChangeKind } from './enums/payment-change-kind.enum.js';
import { OrderPaymentTotals } from './interfaces/order-payment-totals.interface.js';
import { PaymentChange } from './interfaces/payment-change.interface.js';
import { PaymentCommand } from './interfaces/payment-command.interface.js';
import { PaymentOperationWithPayments } from './interfaces/payment-operation-with-payments.interface.js';
import { RefundCommand } from './interfaces/refund-command.interface.js';
import { VoidPaymentCommand } from './interfaces/void-payment-command.interface.js';
import { PaymentLedgerService } from './services/payment-ledger.service.js';
import { PaymentReadService } from './services/payment-read.service.js';

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
    private readonly eventEmitter: EventEmitter2,
  ) {}

  lockKey(
    tx: Prisma.TransactionClient,
    locationId: string,
    idempotencyKey: string,
  ): Promise<void> {
    return this.ledger.lockKey(tx, locationId, idempotencyKey);
  }

  findReplay(
    tx: Prisma.TransactionClient,
    locationId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<PaymentOperationWithPayments | null> {
    return this.ledger.findReplay(tx, locationId, idempotencyKey, requestHash);
  }

  findOperation(
    tx: Prisma.TransactionClient,
    locationId: string,
    orderId: string,
    operationId: string,
  ): Promise<PaymentOperationWithPayments | null> {
    return this.ledger.findOperation(tx, locationId, orderId, operationId);
  }

  assertKeyUnused(
    tx: Prisma.TransactionClient,
    locationId: string,
    idempotencyKey: string,
  ): Promise<void> {
    return this.ledger.assertKeyUnused(tx, locationId, idempotencyKey);
  }

  record(
    tx: Prisma.TransactionClient,
    command: PaymentCommand,
  ): Promise<PaymentChange> {
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
    const parts = (operation: PaymentOperationWithPayments) =>
      operation.payments.map((payment) => ({
        method: payment.method,
        amount: MoneyUtils.format(payment.amount),
      }));
    this.eventEmitter.emit(AUDIT_EVENT, {
      locationId: change.locationId,
      entityType: AuditEntity.ORDER,
      entityId: change.orderId,
      eventType: AUDIT_EVENT_BY_CHANGE[change.kind],
      actionType: AuditActionType.ACTION,
      occurredAt: new Date(),
      actor,
      payload: {
        operationId: change.operation.id,
        operationType: change.operation.type,
        bookingId,
        parts: parts(change.operation),
        occurredAt:
          change.operation.payments[0]?.occurredAt.toISOString() ?? null,
        amountDue: change.amountDue
          ? MoneyUtils.format(change.amountDue)
          : null,
        currency: change.currency,
        reason: change.reason,
        orderReturnId: change.operation.orderReturnId,
        previousOperationId: change.previous?.id ?? null,
        previousParts: change.previous ? parts(change.previous) : null,
      } satisfies PaymentAuditPayload,
    } satisfies AuditLogEvent);
  }
}
