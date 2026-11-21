import { Injectable } from '@nestjs/common';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { PaymentInputDto } from '../payments/dto/payment-input.dto.js';
import { RefundInputDto } from '../payments/dto/refund-input.dto.js';
import { VoidPaymentOperationDto } from '../payments/dto/void-payment-operation.dto.js';
import { PaymentsFacade } from '../payments/payments.facade.js';
import { OrderPaymentView } from './interfaces/order-payment-view.interface.js';
import { OrderWithItems } from './interfaces/order-with-items.interface.js';
import { VisitPaymentUndo } from './interfaces/visit-payment-undo.interface.js';
import { OrderPaymentCorrectionService } from './services/order-payment-correction.service.js';
import { OrderPaymentTrackingService } from './services/order-payment-tracking.service.js';
import { OrderPaymentService } from './services/order-payment.service.js';

/**
 * Money of orders: payments of sales, refunds, voids, the undo of a visit payment and the
 * payment reads of order responses. Audit entries are published after commit.
 */
@Injectable()
export class OrderPaymentsFacade {
  constructor(
    private readonly orderPayments: OrderPaymentService,
    private readonly corrections: OrderPaymentCorrectionService,
    private readonly tracking: OrderPaymentTrackingService,
    private readonly payments: PaymentsFacade,
  ) {}

  /**
   * Payment of each order for `OrderResponseDto.payment`, keyed by order id: the active
   * journal and payment tracking (a visit order by the start of its visit, a sale by its date).
   */
  async paymentViews(
    locationId: string,
    orders: readonly Pick<OrderWithItems, 'id' | 'bookingId' | 'occurredAt'>[],
  ): Promise<Map<string, OrderPaymentView>> {
    const [totals, tracked] = await Promise.all([
      this.payments.totalsByOrders(orders.map((order) => order.id)),
      this.tracking.trackedByOrder(locationId, orders),
    ]);
    return new Map(
      orders.map((order) => [
        order.id,
        { totals: totals.get(order.id) ?? null, tracked: tracked.get(order.id)! },
      ]),
    );
  }

  /** Records or replaces the payment of a sale. */
  async recordPayment(
    locationId: string,
    orderId: string,
    dto: PaymentInputDto,
    actor: AuditActor,
  ): Promise<string> {
    const { operationId, change } = await this.orderPayments.recordSalePayment(
      locationId,
      orderId,
      dto,
      actor,
    );
    this.orderPayments.publish(change, actor);
    return operationId;
  }

  /** Gives money back; works for visit orders too. */
  async refund(
    locationId: string,
    orderId: string,
    dto: RefundInputDto,
    actor: AuditActor,
  ): Promise<string> {
    const { operationId, change, bookingId } = await this.orderPayments.refund(
      locationId,
      orderId,
      dto,
      actor,
    );
    this.orderPayments.publish(change, actor, bookingId);
    return operationId;
  }

  /** Voids a mistaken journal operation; voiding it again changes nothing. */
  async voidPaymentOperation(
    locationId: string,
    orderId: string,
    operationId: string,
    dto: VoidPaymentOperationDto,
    actor: AuditActor,
  ): Promise<void> {
    const { change, bookingId } = await this.corrections.voidOperation(
      locationId,
      orderId,
      operationId,
      dto,
      actor,
    );
    this.orderPayments.publish(change, actor, bookingId);
  }

  /** Undo of a first visit payment by its author; PAYMENT_VOIDED audit after commit. */
  async undoVisitPayment(undo: VisitPaymentUndo): Promise<void> {
    const { change, bookingId } =
      await this.corrections.undoVisitPayment(undo);
    this.orderPayments.publish(change, undo.actor, bookingId);
  }
}
