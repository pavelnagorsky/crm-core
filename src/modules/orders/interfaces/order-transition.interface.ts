import { PaymentChange } from '../../payments/interfaces/payment-change.interface.js';
import { OrderWithItems } from './order-with-items.interface.js';

export interface OrderTransition {
  order: OrderWithItems;
  changed: boolean;
  /** Payment recorded in the same operation, for the audit after commit. */
  payment?: PaymentChange | null;
  /** Confirmed lines whose total at confirmation differs from the draft. */
  repricedItemIds?: string[];
}
