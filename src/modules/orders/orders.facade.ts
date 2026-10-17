import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { BookingWithItems } from '../bookings/interfaces/booking-with-items.interface.js';
import { LocationService } from '../location/services/location.service.js';
import { AddOrderItemsDto } from './dto/add-order-items.dto.js';
import { ConfirmOrderItemsDto } from './dto/confirm-order-items.dto.js';
import { CreateOrderReturnDto } from './dto/create-order-return.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderProductItemDto } from './dto/order-product-item.dto.js';
import { OrderSearchRequestDto } from './dto/order-search-request.dto.js';
import { OrderStatusCountsRequestDto } from './dto/order-status-counts-request.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { OrderTargetStatus } from './enums/order-target-status.enum.js';
import { OrderPricingLine } from './interfaces/order-pricing-line.interface.js';
import { OrderStatusCount } from './interfaces/order-status-count.interface.js';
import { OrderWithItems } from './interfaces/order-with-items.interface.js';
import { OrderAuditService } from './services/order-audit.service.js';
import { OrderBookingSyncService } from './services/order-booking-sync.service.js';
import { OrderCreationService } from './services/order-creation.service.js';
import { OrderDraftMutationService } from './services/order-draft-mutation.service.js';
import { OrderDraftService } from './services/order-draft.service.js';
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
  ): Promise<OrderWithItems> {
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
  ): Promise<OrderWithItems> {
    return this.bookingSync.addDraftProductsToBookingOrder(
      booking,
      items,
      actor,
      tx,
      canOverridePrice,
    );
  }

  priceProductItems(
    locationId: string,
    items: OrderProductItemDto[],
  ): Promise<OrderPricingLine[]> {
    return this.drafts.priceProductItems(locationId, items);
  }

  search(
    locationId: string,
    dto: OrderSearchRequestDto,
  ): Promise<PaginatedResult<OrderWithItems>> {
    return this.persistence.search(locationId, dto);
  }

  getStatusCounts(
    locationId: string,
    dto: OrderStatusCountsRequestDto,
  ): Promise<OrderStatusCount[]> {
    return this.persistence.getStatusCounts(locationId, dto);
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

  async confirmItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const location = await this.locations.findById(locationId);
    const transition = await this.transitions.confirmProductItem(
      locationId,
      orderId,
      orderItemId,
    );
    if (transition.changed) {
      this.audits.record(
        location.brandId,
        locationId,
        orderId,
        AuditEvent.ORDER_ITEM_CONFIRMED,
        AuditActionType.ACTION,
        actor,
        {
          orderItemId,
          totalAmount: transition.order.totalAmount.toFixed(2),
          currency: transition.order.currency,
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
    return transition.order;
  }

  async reverseItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
    rawReason: string,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const reason = rawReason;
    if (!reason) {
      throw new AppException(
        ErrorCode.ORDER_VOID_REASON_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    const location = await this.locations.findById(locationId);
    const transition = await this.transitions.reverseProductItem(
      locationId,
      orderId,
      orderItemId,
      reason,
      actor,
    );
    if (transition.changed) {
      this.audits.record(
        location.brandId,
        locationId,
        orderId,
        AuditEvent.ORDER_ITEM_REVERSED,
        AuditActionType.ACTION,
        actor,
        {
          orderItemId,
          reason,
          totalAmount: transition.order.totalAmount.toFixed(2),
          currency: transition.order.currency,
        },
      );
    }
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
    const order = await this.returns.create(locationId, orderId, dto, actor);
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
    return order;
  }
}
