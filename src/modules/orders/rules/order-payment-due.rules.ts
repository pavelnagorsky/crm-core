import {
  OrderItemStatus,
  OrderItemType,
  OrderReturnStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { OrderDueLine } from '../interfaces/order-due-line.interface.js';
import { OrderDueSource } from '../interfaces/order-due-source.interface.js';

/** Confirmed lines minus their posted returns. Drafts are not sold, reversed lines are gone. */
function confirmedNet(
  lines: readonly OrderDueLine[],
  productsOnly: boolean,
): Prisma.Decimal {
  return lines.reduce((sum, line) => {
    if (line.status !== OrderItemStatus.CONFIRMED) return sum;
    if (productsOnly && line.type !== OrderItemType.PRODUCT) return sum;
    const returned = line.returnItems.reduce(
      (total, item) =>
        item.return.status === OrderReturnStatus.POSTED
          ? total.plus(item.lineTotal)
          : total,
      MoneyUtils.decimal(0),
    );
    return sum.plus(line.lineTotal).minus(returned);
  }, MoneyUtils.decimal(0));
}

/** Sold products of an order: confirmed product lines minus posted returns of them. */
export function orderProductsNet(
  order: Pick<OrderDueSource, 'items'>,
): Prisma.Decimal {
  return confirmedNet(order.items, true);
}

/**
 * Amount due of an order by its own lines: confirmed lines (products and conducted services)
 * minus posted returns; 0 for a voided order. A sale is due exactly this. A visit is due its
 * booking services plus the products (Bookings computes it), which differs before completion.
 */
export function orderAmountDue(order: OrderDueSource): Prisma.Decimal {
  if (order.status !== OrderStatus.ACTIVE) return MoneyUtils.decimal(0);
  return confirmedNet(order.items, false);
}

/**
 * Money that goes back with a product return: what was paid beyond the amount due after the
 * return, at most the return total. Money that was never received is not refunded: an
 * underpaid order may keep everything it got.
 */
export function returnRefundAmount(
  paid: Prisma.Decimal,
  dueAfterReturn: Prisma.Decimal,
  returnTotal: Prisma.Decimal,
): Prisma.Decimal {
  const overpaid = Prisma.Decimal.max(0, paid.minus(dueAfterReturn));
  return Prisma.Decimal.max(0, Prisma.Decimal.min(overpaid, returnTotal));
}
