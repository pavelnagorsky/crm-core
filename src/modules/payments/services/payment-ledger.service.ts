import { ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import { Payment, Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { PAYMENT_REPLACEMENT_VOID_REASON } from '../constants/payment.constants.js';
import { PaymentChangeKind } from '../enums/payment-change-kind.enum.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import { PaymentChange } from '../interfaces/payment-change.interface.js';
import { PaymentCommand } from '../interfaces/payment-command.interface.js';
import { PaymentOperationWithPayments } from '../interfaces/payment-operation-with-payments.interface.js';
import { RefundCommand } from '../interfaces/refund-command.interface.js';
import { VoidPaymentCommand } from '../interfaces/void-payment-command.interface.js';
import { resolvePaymentParts } from '../rules/payment-parts.rules.js';
import { paymentTotals, refundLimit } from '../rules/payment-state.rules.js';

const operationInclude = {
  payments: { orderBy: [{ method: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.PaymentOperationInclude;

/**
 * Writes the money journal. Every write runs in the caller's transaction, and the caller
 * holds the order lock, so the amounts read here cannot change before commit.
 */
@Injectable()
export class PaymentLedgerService {
  /** First lock of a keyed payment action, taken before any read. */
  async lockKey(
    tx: Prisma.TransactionClient,
    locationId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const key = JSON.stringify([
      'payment-operation',
      locationId,
      idempotencyKey,
    ]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  /**
   * The operation a retry already created, or null for a new key. The same key with another
   * request: 409 PAYMENT_IDEMPOTENCY_CONFLICT with `{ operationId }`.
   */
  async findReplay(
    tx: Prisma.TransactionClient,
    locationId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<PaymentOperationWithPayments | null> {
    const existing = await tx.paymentOperation.findUnique({
      where: { locationId_idempotencyKey: { locationId, idempotencyKey } },
      include: operationInclude,
    });
    if (!existing) return null;
    if (existing.requestHash !== requestHash)
      throw new AppException(
        ErrorCode.PAYMENT_IDEMPOTENCY_CONFLICT,
        HttpStatus.CONFLICT,
        { operationId: existing.id },
      );
    return existing;
  }

  /**
   * For a payment of something created in the same request (a new booking): any earlier
   * operation with the key is a different request. 409 PAYMENT_IDEMPOTENCY_CONFLICT.
   */
  async assertKeyUnused(
    tx: Prisma.TransactionClient,
    locationId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const existing = await tx.paymentOperation.findUnique({
      where: { locationId_idempotencyKey: { locationId, idempotencyKey } },
      select: { id: true },
    });
    if (existing)
      throw new AppException(
        ErrorCode.PAYMENT_IDEMPOTENCY_CONFLICT,
        HttpStatus.CONFLICT,
        { operationId: existing.id },
      );
  }

  /** Records the payment of an order, replacing the active one. */
  async record(
    tx: Prisma.TransactionClient,
    command: PaymentCommand,
  ): Promise<PaymentChange> {
    const active = await this.activeRecords(tx, command.orderId);
    const activePayments = active.filter(
      (record) => record.type === PaymentType.PAYMENT,
    );
    const previousId = activePayments[0]?.operationId ?? null;
    if (previousId && !command.canReplace)
      throw new ForbiddenException(
        'Changing a recorded payment requires order:write',
      );
    const refunded = paymentTotals(
      active.filter((record) => record.type === PaymentType.REFUND),
    ).refundedAmount;
    const requiredAmount = command.amountDue.plus(refunded);
    if (requiredAmount.lte(0))
      throw new AppException(
        ErrorCode.PAYMENT_NOTHING_DUE,
        HttpStatus.CONFLICT,
      );
    const parts = resolvePaymentParts(
      command.request,
      requiredAmount,
      command.amountDue,
    );
    const previous = previousId
      ? await tx.paymentOperation.findUniqueOrThrow({
          where: { id: previousId },
          include: { payments: { where: { voidedAt: null } } },
        })
      : null;
    const occurredAt =
      command.request.occurredAt ??
      previous?.payments[0]?.occurredAt ??
      command.defaultOccurredAt;
    if (previous) {
      await this.voidRecords(
        tx,
        previous.id,
        PAYMENT_REPLACEMENT_VOID_REASON,
        command.actor,
      );
    }
    const operation = await tx.paymentOperation.create({
      data: {
        locationId: command.locationId,
        orderId: command.orderId,
        type: PaymentType.PAYMENT,
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        replacesOperationId: previous?.id ?? null,
        createdById: command.actor.id ?? null,
        createdByName: command.actor.name,
        payments: {
          create: parts.map((part) => ({
            locationId: command.locationId,
            orderId: command.orderId,
            type: PaymentType.PAYMENT,
            method: part.method,
            amount: part.amount,
            currency: command.currency,
            occurredAt,
            createdById: command.actor.id ?? null,
            createdByName: command.actor.name,
          })),
        },
      },
      include: operationInclude,
    });
    return {
      kind: previous ? PaymentChangeKind.REPLACED : PaymentChangeKind.RECORDED,
      locationId: command.locationId,
      orderId: command.orderId,
      currency: command.currency,
      operation,
      previous,
      amountDue: command.amountDue,
      reason: null,
    };
  }

  /** Gives money back: a new movement, the days of earlier payments stay as they were. */
  async refund(
    tx: Prisma.TransactionClient,
    command: RefundCommand,
  ): Promise<PaymentChange> {
    const limit = refundLimit(
      paymentTotals(await this.activeRecords(tx, command.orderId)),
      command.method,
    );
    if (command.amount.lte(0) || command.amount.gt(limit))
      throw new AppException(
        ErrorCode.PAYMENT_REFUND_EXCEEDS_PAID,
        HttpStatus.CONFLICT,
        {
          paidAmount: MoneyUtils.format(limit),
          method: command.method,
        },
      );
    const operation = await tx.paymentOperation.create({
      data: {
        locationId: command.locationId,
        orderId: command.orderId,
        type: PaymentType.REFUND,
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        orderReturnId: command.orderReturnId,
        reason: command.reason,
        createdById: command.actor.id ?? null,
        createdByName: command.actor.name,
        payments: {
          create: {
            locationId: command.locationId,
            orderId: command.orderId,
            type: PaymentType.REFUND,
            method: command.method,
            amount: command.amount,
            currency: command.currency,
            occurredAt: command.occurredAt,
            createdById: command.actor.id ?? null,
            createdByName: command.actor.name,
          },
        },
      },
      include: operationInclude,
    });
    return {
      kind: PaymentChangeKind.REFUNDED,
      locationId: command.locationId,
      orderId: command.orderId,
      currency: command.currency,
      operation,
      previous: null,
      amountDue: null,
      reason: command.reason,
    };
  }

  /**
   * Voids the active records of one operation: a correction of a mistaken record.
   * Null when nothing is active any more, so a retry is a no-op.
   */
  async void(
    tx: Prisma.TransactionClient,
    command: VoidPaymentCommand,
    currency: string,
  ): Promise<PaymentChange | null> {
    const operation = await tx.paymentOperation.findFirst({
      where: {
        id: command.operationId,
        orderId: command.orderId,
        locationId: command.locationId,
      },
      include: { payments: { where: { voidedAt: null } } },
    });
    if (!operation)
      throw new AppException(
        ErrorCode.PAYMENT_OPERATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (operation.orderReturnId)
      throw new AppException(
        ErrorCode.PAYMENT_OPERATION_LINKED_TO_RETURN,
        HttpStatus.CONFLICT,
      );
    if (operation.payments.length === 0) return null;
    if (operation.type === PaymentType.PAYMENT) {
      const refunds = await tx.payment.count({
        where: {
          orderId: command.orderId,
          type: PaymentType.REFUND,
          voidedAt: null,
        },
      });
      // Without its payment a refund would leave a negative paid amount.
      if (refunds > 0)
        throw new AppException(
          ErrorCode.PAYMENT_VOID_HAS_REFUNDS,
          HttpStatus.CONFLICT,
        );
    }
    await this.voidRecords(tx, operation.id, command.reason, command.actor);
    return {
      kind: PaymentChangeKind.VOIDED,
      locationId: command.locationId,
      orderId: command.orderId,
      currency,
      operation,
      previous: null,
      amountDue: null,
      reason: command.reason,
    };
  }

  /** One operation of an order with all its records, voided ones included; null if none. */
  findOperation(
    tx: Prisma.TransactionClient,
    locationId: string,
    orderId: string,
    operationId: string,
  ): Promise<PaymentOperationWithPayments | null> {
    return tx.paymentOperation.findFirst({
      where: { id: operationId, orderId, locationId },
      include: operationInclude,
    });
  }

  /** Active payments minus active refunds of an order. */
  async paidAmount(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<Prisma.Decimal> {
    return paymentTotals(await this.activeRecords(tx, orderId)).paidAmount;
  }

  /** Whether the journal holds any record of the order, voided ones included. */
  async hasOperations(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<boolean> {
    return (await tx.paymentOperation.count({ where: { orderId } })) > 0;
  }

  private activeRecords(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<Payment[]> {
    return tx.payment.findMany({
      where: { orderId, voidedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  private async voidRecords(
    tx: Prisma.TransactionClient,
    operationId: string,
    reason: string | null,
    actor: AuditActor,
  ): Promise<void> {
    await tx.payment.updateMany({
      where: { operationId, voidedAt: null },
      data: {
        voidedAt: new Date(),
        voidedById: actor.id ?? null,
        voidedByName: actor.name,
        voidReason: reason,
      },
    });
  }
}
