import { PaymentChange } from '../../payments/interfaces/payment-change.interface.js';
import { OrderWithItems } from './order-with-items.interface.js';

export interface OrderReturnResult {
  order: OrderWithItems;
  /** Money given back with the goods; null when nothing was due back or on a retry. */
  refund: PaymentChange | null;
}
