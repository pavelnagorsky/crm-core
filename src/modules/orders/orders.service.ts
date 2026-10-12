import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderItemStatus, OrderItemType, Prisma } from '@prisma/client';
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
import { AddOrderItemsDto } from './dto/add-order-items.dto.js';
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
import { ResolvedOrderDraft } from './interfaces/resolved-order-draft.interface.js';
import { OrderAuditService } from './services/order-audit.service.js';
import { OrderBookingSyncService } from './services/order-booking-sync.service.js';
import { OrderDraftService } from './services/order-draft.service.js';
import { OrderPersistenceService } from './services/order-persistence.service.js';
import { OrderProductTransitionService } from './services/order-product-transition.service.js';
import { OrderReturnService } from './services/order-return.service.js';
import { OrderStateAssertionService } from './services/order-state-assertion.service.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly drafts: OrderDraftService,
    private readonly audit: OrderAuditService,
    private readonly bookingSync: OrderBookingSyncService,
    private readonly persistence: OrderPersistenceService,
    private readonly transitions: OrderProductTransitionService,
    private readonly returns: OrderReturnService,
    private readonly stateAssertions: OrderStateAssertionService,
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
    const order = await this.persistence.inTransaction(async (tx) => {
      const locked = await this.persistence.findInTransaction(
        tx,
        locationId,
        orderId,
      );
      this.stateAssertions.assertActive(locked.status);
      this.stateAssertions.assertVersion(locked.version, dto.version);
      this.assertEditableUpdateItems(locked, dto.items);
      this.stateAssertions.assertVersionClaimed(
        await this.persistence.incrementVersionIfCurrent(
          tx,
          orderId,
          dto.version,
        ),
      );
      const draft = await this.drafts.resolveDraft(
        locationId,
        dto,
        actor,
        this.editableDraftOrder(locked),
        tx,
        { allowEmptyItems: true },
      );
      const itemChanges = this.buildUpdateItemChanges(
        locked,
        dto.items,
        draft.items,
      );
      await tx.order.update({
        where: { id: orderId },
        data: this.updateOrderData(locked, draft),
        include: orderInclude,
      });
      const editableItems = this.editableDraftItems(locked);
      const incomingIds = new Set(
        dto.items.flatMap((item) => (item.id ? [item.id] : [])),
      );
      const deleteIds = editableItems
        .filter((item) => !incomingIds.has(item.id))
        .map((item) => item.id);
      if (deleteIds.length > 0) {
        await tx.orderItem.deleteMany({
          where: {
            orderId,
            id: { in: deleteIds },
            type: OrderItemType.PRODUCT,
            status: OrderItemStatus.DRAFT,
          },
        });
      }
      for (const [index, item] of dto.items.entries()) {
        const data = draft.items[index];
        if (item.id) {
          await tx.orderItem.update({
            where: { id: item.id },
            data,
          });
          continue;
        }
        await tx.orderItem.create({
          data: {
            orderId,
            ...data,
          } as Prisma.OrderItemUncheckedCreateInput,
        });
      }
      const order = await this.persistence.refreshTotals(
        tx,
        locationId,
        orderId,
        { incrementVersion: false },
      );
      await this.audit.write(tx, {
        brandId: draft.location.brandId,
        locationId,
        entityId: order.id,
        eventType: AuditEvent.ORDER_UPDATED,
        actionType: AuditActionType.MODIFY,
        actor,
        payload: {
          totalAmount: order.totalAmount.toFixed(2),
          currency: order.currency,
          itemChanges,
        },
      });
      return order;
    });
    return order;
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

  async removeDraftProductsForBooking(
    booking: BookingWithItems,
    tx: Prisma.TransactionClient,
  ): Promise<Record<string, unknown>[]> {
    const order = await tx.order.findUnique({
      where: { bookingId: booking.id },
      include: orderInclude,
    });
    if (!order || order.locationId !== booking.locationId) return [];
    const draftProducts = order.items.filter(
      (item) =>
        item.type === OrderItemType.PRODUCT &&
        item.status === OrderItemStatus.DRAFT,
    );
    if (draftProducts.length === 0) return [];
    await tx.orderItem.deleteMany({
      where: {
        orderId: order.id,
        id: { in: draftProducts.map((item) => item.id) },
        type: OrderItemType.PRODUCT,
        status: OrderItemStatus.DRAFT,
      },
    });
    await this.persistence.refreshTotals(tx, booking.locationId, order.id);
    return draftProducts.map((item) => ({
      orderItemId: item.id,
      ...this.audit.itemSnapshot(item),
    }));
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

  getStatusCounts(
    locationId: string,
    dto: OrderStatusCountsRequestDto,
  ): Promise<OrderStatusCount[]> {
    return this.persistence.getStatusCounts(locationId, dto);
  }

  async addDraftItems(
    locationId: string,
    orderId: string,
    dto: AddOrderItemsDto,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const location = await this.locations.findById(locationId);
    const order = await this.persistence.inTransaction(async (tx) => {
      await this.persistence.lockOrder(tx, orderId);
      const order = await this.persistence.findInTransaction(
        tx,
        locationId,
        orderId,
      );
      this.stateAssertions.assertActive(order.status);
      const resolved = await this.drafts.resolveProductItemAdditions(
        locationId,
        order,
        dto.items,
        actor,
        tx,
      );
      for (const item of resolved.updated) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: item.after,
        });
      }
      if (resolved.created.length > 0) {
        await tx.orderItem.createMany({
          data: resolved.created.map((item) => ({
            orderId,
            ...item,
          })),
        });
      }
      const updated = await this.persistence.refreshTotals(
        tx,
        locationId,
        orderId,
      );
      await this.audit.writeUpdated(tx, {
        brandId: location.brandId,
        locationId,
        entityId: updated.id,
        actor,
        payload: {
          totalAmount: updated.totalAmount.toFixed(2),
          currency: updated.currency,
          itemChanges: {
            added: resolved.created.map((item) =>
              this.audit.itemSnapshot(item),
            ),
            removed: [],
            changed: resolved.updated.map((item) => ({
              orderItemId: item.id,
              before: this.audit.itemSnapshot(item.before),
              after: this.audit.itemSnapshot(item.after),
            })),
          },
        },
      });
      return updated;
    });
    return order;
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
      this.stateAssertions.assertActive(order.status);
      this.stateAssertions.assertAllItemsDraft(order);
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
    const idempotencyKey = dto.idempotencyKey;
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

  private assertEditableUpdateItems(
    order: OrderWithItems,
    items: UpdateOrderDto['items'],
  ): void {
    const editableIds = new Set(
      this.editableDraftItems(order).map((item) => item.id),
    );
    const seenItemIds = new Set<string>();
    for (const item of items) {
      if (!item.id) continue;
      if (seenItemIds.has(item.id)) {
        throw new AppException(
          ErrorCode.ORDER_DUPLICATE_ITEM,
          HttpStatus.BAD_REQUEST,
        );
      }
      seenItemIds.add(item.id);
      if (!editableIds.has(item.id)) {
        throw new AppException(
          ErrorCode.ORDER_ITEM_IMMUTABLE,
          HttpStatus.CONFLICT,
        );
      }
    }
    const productIds = items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new AppException(
        ErrorCode.ORDER_DUPLICATE_PRODUCT,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async createReturn(
    locationId: string,
    orderId: string,
    dto: CreateOrderReturnDto,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const order = await this.returns.create(locationId, orderId, dto, actor);
    const location = await this.locations.findById(locationId);
    this.emit(
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

  private editableDraftItems(order: OrderWithItems): OrderWithItems['items'] {
    return order.items.filter(
      (item) =>
        item.type === OrderItemType.PRODUCT &&
        item.status === OrderItemStatus.DRAFT,
    );
  }

  private editableDraftOrder(order: OrderWithItems): OrderWithItems {
    return {
      ...order,
      items: this.editableDraftItems(order),
    };
  }

  private updateOrderData(
    locked: OrderWithItems,
    draft: ResolvedOrderDraft,
  ): Prisma.OrderUncheckedUpdateInput {
    const standaloneClient = locked.bookingId
      ? {
          clientId: locked.clientId,
          clientName: locked.clientName,
          clientPhone: locked.clientPhone,
        }
      : {
          clientId: draft.clientId,
          clientName: draft.clientName,
          clientPhone: draft.clientPhone,
        };
    return {
      ...standaloneClient,
      occurredAt: draft.occurredAt,
      note: draft.note,
    };
  }

  private buildUpdateItemChanges(
    order: OrderWithItems,
    items: UpdateOrderDto['items'],
    resolvedItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[],
  ) {
    const editableById = new Map(
      this.editableDraftItems(order).map((item) => [item.id, item]),
    );
    const incomingIds = new Set(
      items.flatMap((item) => (item.id ? [item.id] : [])),
    );
    const added = [];
    const changed = [];
    for (const [index, item] of items.entries()) {
      const after = this.audit.itemSnapshot(resolvedItems[index]);
      if (!item.id) {
        added.push(after);
        continue;
      }
      const before = this.audit.itemSnapshot(editableById.get(item.id)!);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changed.push({ orderItemId: item.id, before, after });
      }
    }
    const removed = this.editableDraftItems(order)
      .filter((item) => !incomingIds.has(item.id))
      .map((item) => ({
        orderItemId: item.id,
        ...this.audit.itemSnapshot(item),
      }));
    return { added, removed, changed };
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
