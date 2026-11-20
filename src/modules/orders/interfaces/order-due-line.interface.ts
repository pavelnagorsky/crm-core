import { OrderItemStatus, OrderItemType, Prisma } from '@prisma/client';
import { OrderDueReturnLine } from './order-due-return-line.interface.js';

/** The part of an order line that the amount due reads. */
export interface OrderDueLine {
  type: OrderItemType;
  status: OrderItemStatus;
  lineTotal: Prisma.Decimal;
  returnItems: readonly OrderDueReturnLine[];
}
