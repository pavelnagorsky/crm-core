import { OrderItemStatus, OrderItemType, Prisma } from '@prisma/client';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { orderItemSnapshot } from './order-item-snapshot.js';

/**
 * itemChanges of ORDER_UPDATED for draft products added to an order: new lines and merged
 * ones, as priced after the write (drafts have one line per product).
 */
export function draftAdditionChanges(
  resolved: {
    created: Prisma.OrderItemUncheckedCreateWithoutOrderInput[];
    updated: { id: string; before: OrderWithItems['items'][number] }[];
  },
  priced: OrderWithItems,
) {
  const drafts = new Map(
    priced.items
      .filter(
        (item) =>
          item.type === OrderItemType.PRODUCT &&
          item.status === OrderItemStatus.DRAFT,
      )
      .map((item) => [item.catalogItemId, item]),
  );
  const byId = new Map(priced.items.map((item) => [item.id, item]));
  return {
    added: resolved.created.map((item) =>
      orderItemSnapshot(
        (item.catalogItemId && drafts.get(item.catalogItemId)) || item,
      ),
    ),
    removed: [],
    changed: resolved.updated.map((item) => ({
      orderItemId: item.id,
      before: orderItemSnapshot(item.before),
      after: orderItemSnapshot(byId.get(item.id) ?? item.before),
    })),
  };
}
