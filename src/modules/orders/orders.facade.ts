import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { BookingWithItems } from '../bookings/interfaces/booking-with-items.interface.js';
import { LocationService } from '../location/services/location.service.js';
import { AddOrderItemsDto } from './dto/add-order-items.dto.js';
import { ConfirmOrderItemsDto } from './dto/confirm-order-items.dto.js';
import { CreateOrderReturnItemDto } from './dto/create-order-return-item.dto.js';
import { CreateOrderReturnDto } from './dto/create-order-return.dto.js';
import { OrderReturnPreview } from './interfaces/order-return-preview.interface.js';
import { OrderPricingRequestDto } from './dto/order-pricing-request.dto.js';
import { OrderPricingPreview } from './interfaces/order-pricing-preview.interface.js';
import { PurchaseCostAccess } from './interfaces/purchase-cost-access.interface.js';
import { ProductPricingVisit } from './interfaces/product-pricing-scope.interface.js';
import { VisitProductsPricing } from './interfaces/visit-products-pricing.interface.js';
import { ReadConsistency } from '../../shared/cache/enums/read-consistency.enum.js';
import { OrderPricingPreviewService } from './services/order-pricing-preview.service.js';
import { OrderProductPricingService } from './services/order-product-pricing.service.js';
import { ProductPriceQuote } from '../pricing/interfaces/product-price-quote.interface.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderProductItemDto } from './dto/order-product-item.dto.js';
import { OrderSearchRequestDto } from './dto/order-search-request.dto.js';
import { OrderStatusCountsRequestDto } from './dto/order-status-counts-request.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { OrderTargetStatus } from './enums/order-target-status.enum.js';
import { BookingOrderProducts } from './interfaces/booking-order-products.interface.js';
import { DraftProductsAdded } from './interfaces/draft-products-added.interface.js';
import { OrderStatusCount } from './interfaces/order-status-count.interface.js';
import { OrderTransition } from './interfaces/order-transition.interface.js';
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
    private readonly pricingPreview: OrderPricingPreviewService,
    private readonly productPricing: OrderProductPricingService,
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
   * holds the booking lock (lock order: payment key, limited promotions, booking, order).
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
   * like a group confirmation. The lines are priced again with fresh data and must add up to
   * `expectedProductTotal` (409 PRICE_CHANGED). 404 ORDER_ITEM_NOT_FOUND, 409
   * ORDER_ITEM_NOT_DRAFT, ORDER_PRODUCT_NOT_SELLABLE, ORDER_SELLER_INVALID.
   */
  async confirmBookingProducts(
    order: OrderWithItems,
    orderItemIds: string[],
    expectedProductTotal: Prisma.Decimal,
    tx: Prisma.TransactionClient,
    occurredAt = new Date(),
  ): Promise<OrderTransition> {
    if (orderItemIds.length === 0) return { order, changed: false };
    return this.transitions.confirmProductItemsInTransaction(
      order.locationId,
      order.id,
      orderItemIds,
      tx,
      { expectedTotal: expectedProductTotal },
      occurredAt,
      { order },
    );
  }

  /**
   * Prices the draft products of a visit order again after a booking write that changes
   * their context (start, client, promo code, services). The caller holds the booking lock.
   */
  repriceBookingDrafts(
    booking: Pick<BookingWithItems, 'id' | 'locationId'>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.bookingSync.repriceBookingDrafts(booking, tx);
  }

  /** Order history entry of product lines confirmed with a visit. Call after commit. */
  async recordProductsConfirmed(
    order: OrderWithItems,
    orderItemIds: string[],
    actor: AuditActor,
    repricedItemIds: string[] = [],
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
        repricedItemIds,
        totalAmount: order.totalAmount.toFixed(2),
        currency: order.currency,
      },
    );
  }

  /** Sold products of an order: confirmed product lines minus posted returns. */
  productsNet(order: OrderWithItems): Prisma.Decimal {
    return orderProductsNet(order);
  }

  /**
   * Visit order id, sold products (`productsNet`) and draft product count of each booking
   * that has an order.
   */
  productTotalsByBookings(
    bookingIds: readonly string[],
    client?: Prisma.TransactionClient,
  ): Promise<Map<string, BookingOrderProducts>> {
    return this.persistence.productTotalsByBookings(bookingIds, client);
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
          repricedItemIds: transition.repricedItemIds ?? [],
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

  /**
   * New product lines of a visit priced in the booking context (booking window, booking
   * creation). Nothing is stored.
   */
  priceVisitProducts(
    locationId: string,
    brand: { brandId: string; timezone: string },
    visit: ProductPricingVisit,
    items: OrderProductItemDto[],
    consistency: ReadConsistency,
    access: PurchaseCostAccess,
  ): Promise<VisitProductsPricing> {
    return this.pricingPreview.priceVisitProducts(
      locationId,
      brand,
      visit,
      items,
      consistency,
      access,
    );
  }

  /**
   * Draft products of a booking's visit order priced in the visit context a booking edit is
   * about to write. Nothing is stored; null without drafts.
   */
  quoteVisitDrafts(
    location: { id: string; brandId: string; timezone: string },
    visit: ProductPricingVisit & { bookingId: string },
  ): Promise<ProductPriceQuote | null> {
    return this.productPricing.quoteVisitDrafts(location, visit);
  }

  /** POST orders/pricing: product lines priced, nothing stored. */
  previewPricing(
    locationId: string,
    dto: OrderPricingRequestDto,
    canOverridePrice: boolean,
    access: PurchaseCostAccess,
  ): Promise<OrderPricingPreview> {
    return this.pricingPreview.preview(
      locationId,
      dto,
      canOverridePrice,
      access,
    );
  }

  /** Amounts of a product return without storing it (same rules as createReturn). */
  previewReturn(
    locationId: string,
    orderId: string,
    items: CreateOrderReturnItemDto[],
  ): Promise<OrderReturnPreview> {
    return this.returns.preview(locationId, orderId, items);
  }

  private async dayFilterTimezone(
    locationId: string,
    dto: { dateFrom?: string; dateTo?: string },
  ): Promise<string | undefined> {
    if (!dto.dateFrom && !dto.dateTo) return undefined;
    return (await this.locations.getLocale(locationId)).timezone;
  }
}
