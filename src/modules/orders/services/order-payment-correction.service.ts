import { Injectable } from '@nestjs/common';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { VoidPaymentOperationDto } from '../../payments/dto/void-payment-operation.dto.js';
import { PaymentsFacade } from '../../payments/payments.facade.js';
import { OrderPaymentVoidResult } from '../interfaces/order-payment-void-result.interface.js';
import { VisitPaymentUndo } from '../interfaces/visit-payment-undo.interface.js';
import {
  assertVisitParticipant,
  assertVoidAllowedForVisit,
} from '../rules/order-payment-correction.rules.js';
import { OrderLockService } from './order-lock.service.js';
import { OrderPersistenceService } from './order-persistence.service.js';

/** Corrections of mistaken journal records: voids by order:write and undos by the author. */
@Injectable()
export class OrderPaymentCorrectionService {
  constructor(
    private readonly persistence: OrderPersistenceService,
    private readonly locks: OrderLockService,
    private readonly payments: PaymentsFacade,
  ) {}

  /**
   * Voids one operation; voiding it again changes nothing. An active refund of a deleted
   * visit stays (409 BOOKING_PAYMENT_NOT_ALLOWED); the booking lock keeps this consistent
   * with a delete.
   */
  voidOperation(
    locationId: string,
    orderId: string,
    operationId: string,
    dto: VoidPaymentOperationDto,
    actor: AuditActor,
  ): Promise<OrderPaymentVoidResult> {
    return this.persistence.inTransaction(async (tx) => {
      const { order, visit } = await this.locks.lockOrderWithVisit(
        tx,
        locationId,
        orderId,
      );
      if (visit?.deleted)
        assertVoidAllowedForVisit(
          visit,
          await this.payments.findOperation(
            tx,
            locationId,
            orderId,
            operationId,
          ),
        );
      const change = await this.payments.void(
        tx,
        { locationId, orderId, operationId, reason: dto.reason || null, actor },
        order.currency,
      );
      return { change, bookingId: order.bookingId };
    });
  }

  /**
   * Undoes a first payment of a visit that its author has just recorded. Works with payment
   * tracking disabled: it fixes a mistake. The visit keeps its status. A master limited to
   * own visits must still take part in the locked visit (403). 404 Booking not found,
   * 404 PAYMENT_OPERATION_NOT_FOUND, 409 PAYMENT_UNDO_NOT_ALLOWED, PAYMENT_UNDO_EXPIRED.
   */
  undoVisitPayment(undo: VisitPaymentUndo): Promise<OrderPaymentVoidResult> {
    return this.persistence.inTransaction(async (tx) => {
      const { order, visit } = await this.locks.lockVisitOrder(
        tx,
        undo.locationId,
        undo.bookingId,
      );
      assertVisitParticipant(visit, undo.participantStaffId);
      const change = await this.payments.undo(
        tx,
        {
          locationId: undo.locationId,
          orderId: order.id,
          operationId: undo.operationId,
          actor: undo.actor,
          now: undo.now,
        },
        order.currency,
      );
      return { change, bookingId: undo.bookingId };
    });
  }
}
