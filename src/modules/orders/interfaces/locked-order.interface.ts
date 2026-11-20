import { VisitPaymentFacts } from '../../bookings/visits/interfaces/visit-payment-facts.interface.js';
import { OrderWithItems } from './order-with-items.interface.js';

/** An order locked FOR UPDATE, with the facts of its visit locked before it. */
export interface LockedOrder {
  order: OrderWithItems;
  /** Null for a sale. */
  visit: VisitPaymentFacts | null;
}
