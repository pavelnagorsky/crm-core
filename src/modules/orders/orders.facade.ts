import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { BookingWithItems } from '../bookings/interfaces/booking-with-items.interface.js';
import { LocationService } from '../location/services/location.service.js';
import { PaymentInputDto } from '../payments/dto/payment-input.dto.js';
import { RefundInputDto } from '../payments/dto/refund-input.dto.js';
import { VoidPaymentOperationDto } from '../payments/dto/void-payment-operation.dto.js';
import { OrderPaymentTotals } from '../payments/interfaces/order-payment-totals.interface.js';
import { PaymentsFacade } from '../payments/payments.facade.js';
import { AddOrderItemsDto } from './dto/add-order-items.dto.js';
import { ConfirmOrderItemsDto } from './dto/confirm-order-items.dto.js';
import { CreateOrderReturnDto } from './dto/create-order-return.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderProductItemDto } from './dto/order-product-item.dto.js';
import { OrderSearchRequestDto } from './dto/order-search-request.dto.js';
import { OrderStatusCountsRequestDto } from './dto/order-status-counts-request.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { OrderTargetStatus } from './enums/order-target-status.enum.js';
import { BookingOrderProducts } from './interfaces/booking-order-products.interface.js';
import { DraftProductsAdded } from './interfaces/draft-products-added.interface.js';
import { OrderPricingLine } from './interfaces/order-pricing-line.interface.js';
import { OrderStatusCount } from './interfaces/order-status-count.interface.js';
import { OrderWithItems } from './interfaces/order-with-items.interface.js';
import { orderProductsNet } from './rules/order-payment-due.rules.js';
import { OrderAuditService } from './services/order-audit.service.js';
import { OrderBookingSyncService } from './services/order-booking-sync.service.js';
import { OrderCreationService } from './services/order-creation.service.js';
import { OrderDraftMutationService } from './services/order-draft-mutation.service.js';
import { OrderDraftService } from './services/order-draft.service.js';
import { OrderPaymentService } from './services/order-payment.service.js';
import { OrderPersistenceService } from './services/order-persistence.service.js';
import { OrderProductTransitionService } from './services/order-product-transition.service.js';
import { OrderReturnService } from './services/order-return.service.js';
@Injectable()
export class OrdersFacade {
  constructor(
    private readonly locations: LocationService,
    private readonly drafts: OrderDraftService,
    private readonly bookingSync: OrderBookingSyncService,
    private readonly persistence: OrderPersistenceService,
    private readonly transitions: OrderProductTransitionService,
    private readonly returns: OrderReturnService,
    private readonly creation: OrderCreationService,
    private readonly mutations: OrderDraftMutationService,
    private readonly audits: OrderAuditService,
    private readonly orderPayments: OrderPaymentService,
    private readonly payments: PaymentsFacade,
  ) {}
  create(
    locationId: string,
    dto: CreateOrderDto,
    actor: AuditActor,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    return this.creation.create(locationId, dto, actor, canOverridePrice);
  }

  update(
    locationId: string,
    orderId: string,
    dto: UpdateOrderDto,
    actor: AuditActor,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    return this.mutations.update(
      locationId,
      orderId,
      dto,
      actor,
      canOverridePrice,
    );
  }

  findById(locationId: string, orderId: string): Promise<OrderWithItems> {
    return this.persistence.findById(locationId, orderId);
  }

  /** Active journal of each order, for `OrderResponseDto.payment`. */
  paymentTotals(
    orders: readonly Pick<OrderWithItems, 'id'>[],
  ): Promise<Map<string, OrderPaymentTotals>> {
    return this.payments.totalsByOrders(orders.map((order) => order.id));
  }

  syncBookingClient(
    booking: BookingWithItems,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.bookingSync.syncBookingClient(booking, tx);
  }

  syncCompletedBooking(
    booking: BookingWithItems,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    return this.bookingSync.syncCompletedBooking(booking, actor, tx);
  }

  reverseCompletedBookingServices(
    booking: BookingWithItems,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems | null> {
    return this.bookingSync.reverseCompletedBookingServices(booking, tx);
  }

  removeDraftProductsForBooking(
    booking: BookingWithItems,
    tx: Prisma.TransactionClient,
  ): Promise<Record<string, unknown>[]> {
    return this.bookingSync.removeDraftProductsForBooking(booking, tx);
  }

  addDraftProductToBookingOrder(
    booking: BookingWithItems,
    dto: OrderProductItemDto,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
    canOverridePrice = false,
  ): Promise<DraftProductsAdded> {
    return this.bookingSync.addDraftProductToBookingOrder(
      booking,
      dto,
      actor,
      tx,
      canOverridePrice,
    );
  }

  addDraftProductsToBookingOrder(
    booking: BookingWithItems,
    items: OrderProductItemDto[],
    actor: AuditActor,
    tx: Prisma.TransactionClient,
    canOverridePrice = false,
  ): Promise<DraftProductsAdded> {
    return this.bookingSync.addDraftProductsToBookingOrder(
      booking,
      items,
      actor,
      tx,
      canOverridePrice,
    );
  }

  /** ORDER_UPDATED of draft products added to a visit order. Call after commit. */
  publishDraftProductsAdded(
    added: DraftProductsAdded,
    actor: AuditActor,
  ): void {
    this.bookingSync.publishDraftProductsAdded(added, actor);
  }

  /**
   * The visit order of a booking, created when missing and locked FOR UPDATE. The caller
   * holds the booking lock (lock order: payment key, booking, order).
   */
  lockBookingOrder(
    booking: BookingWithItems,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    return this.bookingSync.lockBookingOrder(booking, actor, tx);
  }

  /** The visit order of a booking, or null. */
  findBookingOrder(
    booking: Pick<BookingWithItems, 'id' | 'locationId'>,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems | null> {
    return this.persistence.findForBookingInTransaction(
      tx,
      booking.locationId,
      booking.id,
    );
  }

  /**
   * Confirms draft product lines of a locked visit order: stock, cost and seller commission
   * like a group confirmation. 404 ORDER_ITEM_NOT_FOUND, 409 ORDER_ITEM_NOT_DRAFT,
   * ORDER_PRODUCT_NOT_SELLABLE, ORDER_SELLER_INVALID.
   */
  async confirmBookingProducts(
    order: OrderWithItems,
    orderItemIds: string[],
    tx: Prisma.TransactionClient,
    occurredAt = new Date(),
  ): Promise<OrderWithItems> {
    if (orderItemIds.length === 0) return order;
    const transition = await this.transitions.confirmProductItemsInTransaction(
      order.locationId,
      order.id,
      orderItemIds,
      tx,
      occurredAt,
      { order },
    );
    return transition.order;
  }

  /** Order history entry of product lines confirmed with a visit. Call after commit. */
  async recordProductsConfirmed(
    order: OrderWithItems,
    orderItemIds: string[],
    actor: AuditActor,
  ): Promise<void> {
    if (orderItemIds.length === 0) return;
    const location = await this.locations.findById(order.locationId);
    this.audits.record(
      location.brandId,
      order.locationId,
      order.id,
      AuditEvent.ORDER_ITEM_CONFIRMED,
      AuditActionType.ACTION,
      actor,
      {
        orderItemIds,
        totalAmount: order.totalAmount.toFixed(2),
        currency: order.currency,
      },
    );
  }

  /** Sold products of an order: confirmed product lines minus posted returns. */
  productsNet(order: OrderWithItems): Prisma.Decimal {
    return orderProductsNet(order);
  }

  /** Visit order id and sold products (`productsNet`) of each booking that has an order. */
  productTotalsByBookings(
    bookingIds: readonly string[],
    client?: Prisma.TransactionClient,
  ): Promise<Map<string, BookingOrderProducts>> {
    return this.persistence.productTotalsByBookings(bookingIds, client);
  }

  priceProductItems(
    locationId: string,
    items: OrderProductItemDto[],
  ): Promise<OrderPricingLine[]> {
    return this.drafts.priceProductItems(locationId, items);
  }

  async search(
    locationId: string,
    dto: OrderSearchRequestDto,
  ): Promise<PaginatedResult<OrderWithItems>> {
    return this.persistence.search(
      locationId,
      dto,
      await this.dayFilterTimezone(locationId, dto),
    );
  }

  async getStatusCounts(
    locationId: string,
    dto: OrderStatusCountsRequestDto,
  ): Promise<OrderStatusCount[]> {
    return this.persistence.getStatusCounts(
      locationId,
      dto,
      await this.dayFilterTimezone(locationId, dto),
    );
  }

  addDraftItems(
    locationId: string,
    orderId: string,
    dto: AddOrderItemsDto,
    actor: AuditActor,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    return this.mutations.addDraftItems(
      locationId,
      orderId,
      dto,
      actor,
      canOverridePrice,
    );
  }

  async changeStatus(
    locationId: string,
    orderId: string,
    _status: OrderTargetStatus,
    reason: string | undefined,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const location = await this.locations.findById(locationId);
    const transition = await this.transitions.void(
      locationId,
      orderId,
      reason,
      actor,
    );
    if (transition.changed) {
      this.audits.record(
        location.brandId,
        locationId,
        orderId,
        AuditEvent.ORDER_VOIDED,
        AuditActionType.ACTION,
        actor,
        {
          totalAmount: transition.order.totalAmount.toFixed(2),
          currency: transition.order.currency,
          reason: transition.order.voidReason,
        },
      );
    }
    return transition.order;
  }

  async confirmItems(
    locationId: string,
    orderId: string,
    dto: ConfirmOrderItemsDto,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const transition = await this.transitions.confirmItems(
      locationId,
      orderId,
      dto,
      actor,
    );
    if (transition.changed) {
      const location = await this.locations.findById(locationId);
      this.audits.record(
        location.brandId,
        locationId,
        orderId,
        AuditEvent.ORDER_ITEM_CONFIRMED,
        AuditActionType.ACTION,
        actor,
        {
          orderItemIds: dto.itemIds,
          totalAmount: transition.order.totalAmount.toFixed(2),
          currency: transition.order.currency,
        },
      );
    }
    this.orderPayments.publish(transition.payment, actor);
    return transition.order;
  }

  delete(
    locationId: string,
    orderId: string,
    actor: AuditActor,
  ): Promise<void> {
    return this.mutations.delete(locationId, orderId, actor);
  }

  async createReturn(
    locationId: string,
    orderId: string,
    dto: CreateOrderReturnDto,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const { order, refund } = await this.returns.create(
      locationId,
      orderId,
      dto,
      actor,
    );
    const location = await this.locations.findById(locationId);
    this.audits.record(
      location.brandId,
      locationId,
      orderId,
      AuditEvent.ORDER_ITEM_REVERSED,
      AuditActionType.ACTION,
      actor,
      {
        itemReturns: dto.items,
        reason: dto.reason,
        totalAmount: order.totalAmount.toFixed(2),
        currency: order.currency,
      },
    );
    this.orderPayments.publish(refund, actor, order.bookingId);
    return order;
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

  async voidPaymentOperation(
    locationId: string,
    orderId: string,
    operationId: string,
    dto: VoidPaymentOperationDto,
    actor: AuditActor,
  ): Promise<void> {
    const { change, bookingId } = await this.orderPayments.voidOperation(
      locationId,
      orderId,
      operationId,
      dto,
      actor,
    );
    this.orderPayments.publish(change, actor, bookingId);
  }

  private async dayFilterTimezone(
    locationId: string,
    dto: { dateFrom?: string; dateTo?: string },
  ): Promise<string | undefined> {
    if (!dto.dateFrom && !dto.dateTo) return undefined;
    return (await this.locations.getLocale(locationId)).timezone;
  }
}
