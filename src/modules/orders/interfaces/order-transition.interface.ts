import { OrderWithItems } from './order-with-items.interface.js';

export interface OrderTransition {
  order: OrderWithItems;
  changed: boolean;
}
