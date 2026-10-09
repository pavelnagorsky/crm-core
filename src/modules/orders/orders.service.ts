import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderItemStatus, OrderStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../audit/constants/audit.constants.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { BookingWithItems } from '../bookings/interfaces/booking-with-items.interface.js';
import { LocationService } from '../location/location.service.js';
import { orderInclude } from './constants/order-include.constant.js';
import { ConfirmOrderItemsDto } from './dto/confirm-order-items.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderProductItemDto } from './dto/order-product-item.dto.js';
import { OrderSearchRequestDto } from './dto/order-search-request.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { OrderTargetStatus } from './enums/order-target-status.enum.js';
import { OrderPricingLine } from './interfaces/order-pricing-line.interface.js';
import { OrderWithItems } from './interfaces/order-with-items.interface.js';
import { OrderBookingSyncService } from './services/order-booking-sync.service.js';
import { OrderDraftService } from './services/order-draft.service.js';
import { OrderPersistenceService } from './services/order-persistence.service.js';
import { OrderProductTransitionService } from './services/order-product-transition.service.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly drafts: OrderDraftService,
    private readonly bookingSync: OrderBookingSyncService,
    private readonly persistence: OrderPersistenceService,
    private readonly transitions: OrderProductTransitionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    locationId: string,
    dto: CreateOrderDto,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    if (dto.confirmImmediately) {
      return this.createAndConfirmProductSale(locationId, dto, actor);
    }
    const draft = await this.drafts.resolveDraft(locationId, dto, actor);
    const order = await this.db.order.create({
      data: {
        locationId,
        bookingId: draft.bookingId,
        clientId: draft.clientId,
        clientName: draft.clientName,
        clientPhone: draft.clientPhone,
        currency: draft.location.currency,
        occurredAt: draft.occurredAt,
        note: draft.note,
        createdById: actor.id ?? null,
        createdByName: actor.name,
        ...draft.totals,
        items: { create: draft.items },
      },
      include: orderInclude,
    });
    this.emit(
      draft.location.brandId,
      locationId,
      order.id,
      AuditEvent.ORDER_CREATED,
      AuditActionType.CREATE,
      actor,
      { totalAmount: order.totalAmount.toFixed(2), currency: order.currency },
    );
    return order;
  }

  async update(
    locationId: string,
    orderId: string,
    dto: UpdateOrderDto,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const result = await this.persistence.inTransaction(async (tx) => {
      await this.persistence.lockOrder(tx, orderId);
      const locked = await this.persistence.findInTransaction(
        tx,
        locationId,
        orderId,
      );
      this.assertActive(locked.status);
      this.assertDraftItems(locked);
      const draft = await this.drafts.resolveDraft(
        locationId,
        dto,
        actor,
        locked,
        tx,
      );
      await tx.orderItem.deleteMany({ where: { orderId } });
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          bookingId: draft.bookingId,
          clientId: draft.clientId,
          clientName: draft.clientName,
          clientPhone: draft.clientPhone,
          occurredAt: draft.occurredAt,
          note: draft.note,
          ...draft.totals,
          items: { create: draft.items },
        },
        include: orderInclude,
      });
      return { order, draft };
    });
    this.emit(
      result.draft.location.brandId,
      locationId,
      result.order.id,
      AuditEvent.ORDER_UPDATED,
      AuditActionType.MODIFY,
      actor,
      {
        totalAmount: result.order.totalAmount.toFixed(2),
        currency: result.order.currency,
      },
    );
    return result.order;
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

  addDraftProductToBookingOrder(
    booking: BookingWithItems,
    dto: OrderProductItemDto,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    return this.bookingSync.addDraftProductToBookingOrder(
      booking,
      dto,
      actor,
      tx,
    );
  }

  addDraftProductsToBookingOrder(
    booking: BookingWithItems,
    items: OrderProductItemDto[],
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    return this.bookingSync.addDraftProductsToBookingOrder(
      booking,
      items,
      actor,
      tx,
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

  async changeStatus(
    locationId: string,
    orderId: string,
    _status: OrderTargetStatus,
    reason: string | undefined,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    if (!this.drafts.canSetCustomPrice(actor)) {
      throw new ForbiddenException('Only an owner can void an order');
    }
    const location = await this.locations.findById(locationId);
    const transition = await this.transitions.void(
      locationId,
      orderId,
      reason,
      actor,
    );
    if (transition.changed) {
      this.emit(
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
      this.emit(
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
      this.emit(
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
    const reason = rawReason.trim();
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
      this.emit(
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

  async delete(
    locationId: string,
    orderId: string,
    actor: AuditActor,
  ): Promise<void> {
    const location = await this.locations.findById(locationId);
    const deleted = await this.persistence.inTransaction(async (tx) => {
      await this.persistence.lockOrder(tx, orderId);
      const order = await this.persistence.findInTransaction(
        tx,
        locationId,
        orderId,
      );
      this.assertActive(order.status);
      this.assertDraftItems(order);
      await tx.order.delete({ where: { id: orderId } });
      return order;
    });
    this.emit(
      location.brandId,
      locationId,
      orderId,
      AuditEvent.ORDER_DELETED,
      AuditActionType.DELETE,
      actor,
      {
        totalAmount: deleted.totalAmount.toFixed(2),
        currency: deleted.currency,
      },
    );
  }

  private async createAndConfirmProductSale(
    locationId: string,
    dto: CreateOrderDto,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException(
        'idempotencyKey is required for confirmed product sales',
      );
    }
    const result = await this.persistence.inTransaction(async (tx) => {
      const existing = await tx.order.findFirst({
        where: { locationId, idempotencyKey },
        include: orderInclude,
      });
      if (existing) return { order: existing, draft: null, created: false };
      const draft = await this.drafts.resolveDraft(
        locationId,
        dto,
        actor,
        undefined,
        tx,
      );
      const order = await tx.order.upsert({
        where: {
          locationId_idempotencyKey: {
            locationId,
            idempotencyKey,
          },
        },
        update: {},
        create: {
          locationId,
          bookingId: null,
          clientId: draft.clientId,
          clientName: draft.clientName,
          clientPhone: draft.clientPhone,
          currency: draft.location.currency,
          occurredAt: draft.occurredAt,
          note: draft.note,
          idempotencyKey,
          createdById: actor.id ?? null,
          createdByName: actor.name,
          ...draft.totals,
          items: { create: draft.items },
        },
        include: orderInclude,
      });
      const created = order.items.some(
        (item) => item.status === OrderItemStatus.DRAFT,
      );
      const transition =
        await this.transitions.confirmProductItemsInTransaction(
          locationId,
          order.id,
          order.items.map((item) => item.id),
          tx,
          order.occurredAt,
        );
      return { order: transition.order, draft, created };
    });
    if (result.created && result.draft) {
      this.emit(
        result.draft.location.brandId,
        locationId,
        result.order.id,
        AuditEvent.ORDER_CREATED,
        AuditActionType.CREATE,
        actor,
        {
          totalAmount: result.order.totalAmount.toFixed(2),
          currency: result.order.currency,
        },
      );
    }
    return result.order;
  }

  private assertActive(status: OrderStatus): void {
    if (status !== OrderStatus.ACTIVE) {
      throw new AppException(ErrorCode.ORDER_NOT_ACTIVE, HttpStatus.CONFLICT);
    }
  }

  private assertDraftItems(order: OrderWithItems): void {
    if (order.items.some((item) => item.status !== OrderItemStatus.DRAFT)) {
      throw new AppException(
        ErrorCode.ORDER_ITEM_NOT_DRAFT,
        HttpStatus.CONFLICT,
      );
    }
  }

  private emit(
    brandId: string,
    locationId: string,
    entityId: string,
    eventType: AuditEvent,
    actionType: AuditActionType,
    actor: AuditActor,
    payload: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(AUDIT_EVENT, {
      brandId,
      locationId,
      entityType: AuditEntity.ORDER,
      entityId,
      eventType,
      actionType,
      occurredAt: new Date(),
      actor,
      payload,
    } satisfies AuditLogEvent);
  }
}
