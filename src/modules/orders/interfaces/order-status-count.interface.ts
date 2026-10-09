import { OrderStatus } from '../enums/order-status.enum.js';

export interface OrderStatusCount {
  status: OrderStatus;
  count: number;
}
