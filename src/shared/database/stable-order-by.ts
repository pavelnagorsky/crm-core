import { OrderDirection } from '../enums/order-direction.enum.js';

export function stableOrderBy<T extends object>(
  orderBy: T | readonly T[],
  direction: OrderDirection,
): Array<T | { id: OrderDirection }> {
  return [...(Array.isArray(orderBy) ? orderBy : [orderBy]), { id: direction }];
}
