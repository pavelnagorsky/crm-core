import { OrderWithItems } from './order-with-items.interface.js';

/** Draft products added to a visit order, with the audit entry to publish after commit. */
export interface DraftProductsAdded {
  order: OrderWithItems;
  brandId: string;
  /** ORDER_UPDATED payload: totals and item changes. */
  auditPayload: Record<string, unknown>;
}
