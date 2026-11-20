import { OrderStatus } from '@prisma/client';
import { OrderDueLine } from './order-due-line.interface.js';

/** The part of an order that the amount due reads. */
export interface OrderDueSource {
  status: OrderStatus;
  items: readonly OrderDueLine[];
}
