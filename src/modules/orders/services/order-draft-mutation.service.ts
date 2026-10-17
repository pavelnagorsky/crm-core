import { HttpStatus, Injectable } from '@nestjs/common';
import { OrderItemStatus, OrderItemType, Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { LocationService } from '../../location/services/location.service.js';
import { AddOrderItemsDto } from '../dto/add-order-items.dto.js';
import { UpdateOrderDto } from '../dto/update-order.dto.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { ResolvedOrderDraft } from '../interfaces/resolved-order-draft.interface.js';
import { OrderStateRules } from '../rules/order-state.rules.js';
import { orderItemSnapshot } from '../utils/order-item-snapshot.js';
import { OrderAuditService } from './order-audit.service.js';
import { OrderDraftService } from './order-draft.service.js';
import { OrderPersistenceService } from './order-persistence.service.js';
@Injectable()
export class OrderDraftMutationService {
  constructor(
    private readonly locations: LocationService,
    private readonly drafts: OrderDraftService,
    private readonly persistence: OrderPersistenceService,
    private readonly stateAssertions: OrderStateRules,
    private readonly audits: OrderAuditService,
  ) {}
  async update(
    locationId: string,
    orderId: string,
    dto: UpdateOrderDto,
    actor: AuditActor,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    const result = await this.persistence.inTransaction(async (tx) => {
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
        canOverridePrice,
      );
      const itemChanges = this.buildUpdateItemChanges(
        locked,
        dto.items,
        draft.items,
      );
      await tx.order.update({
        where: { id: orderId },
        data: this.updateOrderData(locked, draft),
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
      return { order, brandId: draft.location.brandId, itemChanges };
    });
    this.recordUpdated(result.brandId, result.order, actor, result.itemChanges);
    return result.order;
  }

  async addDraftItems(
    locationId: string,
    orderId: string,
    dto: AddOrderItemsDto,
    actor: AuditActor,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    const location = await this.locations.findById(locationId);
    const result = await this.persistence.inTransaction(async (tx) => {
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
        canOverridePrice,
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
      return {
        order: updated,
        itemChanges: {
          added: resolved.created.map((item) => orderItemSnapshot(item)),
          removed: [],
          changed: resolved.updated.map((item) => ({
            orderItemId: item.id,
            before: orderItemSnapshot(item.before),
            after: orderItemSnapshot(item.after),
          })),
        },
      };
    });
    this.recordUpdated(
      location.brandId,
      result.order,
      actor,
      result.itemChanges,
    );
    return result.order;
  }

  private recordUpdated(
    brandId: string,
    order: OrderWithItems,
    actor: AuditActor,
    itemChanges: Record<string, unknown>,
  ): void {
    this.audits.record(
      brandId,
      order.locationId,
      order.id,
      AuditEvent.ORDER_UPDATED,
      AuditActionType.MODIFY,
      actor,
      {
        totalAmount: order.totalAmount.toFixed(2),
        currency: order.currency,
        itemChanges,
      },
    );
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
    this.audits.record(
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
      const after = orderItemSnapshot(resolvedItems[index]);
      if (!item.id) {
        added.push(after);
        continue;
      }
      const before = orderItemSnapshot(editableById.get(item.id)!);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changed.push({ orderItemId: item.id, before, after });
      }
    }
    const removed = this.editableDraftItems(order)
      .filter((item) => !incomingIds.has(item.id))
      .map((item) => ({
        orderItemId: item.id,
        ...orderItemSnapshot(item),
      }));
    return { added, removed, changed };
  }
}
