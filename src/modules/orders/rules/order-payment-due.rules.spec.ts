import {
  OrderItemStatus,
  OrderItemType,
  OrderReturnStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import {
  orderAmountDue,
  orderProductsNet,
  returnRefundAmount,
} from './order-payment-due.rules.js';

const d = (value: string) => new Prisma.Decimal(value);

function line(
  type: OrderItemType,
  status: OrderItemStatus,
  lineTotal: string,
  returns: Array<[string, OrderReturnStatus]> = [],
) {
  return {
    type,
    status,
    lineTotal: d(lineTotal),
    returnItems: returns.map(([amount, returnStatus]) => ({
      lineTotal: d(amount),
      return: { status: returnStatus },
    })),
  };
}

const items = [
  line(OrderItemType.SERVICE, OrderItemStatus.CONFIRMED, '1500.00'),
  line(OrderItemType.PRODUCT, OrderItemStatus.CONFIRMED, '300.00', [
    ['100.00', OrderReturnStatus.POSTED],
    ['50.00', OrderReturnStatus.VOIDED],
  ]),
  line(OrderItemType.PRODUCT, OrderItemStatus.DRAFT, '700.00'),
  line(OrderItemType.PRODUCT, OrderItemStatus.REVERSED, '900.00'),
  line(OrderItemType.SERVICE, OrderItemStatus.REVERSED, '1000.00'),
];

describe('orderProductsNet', () => {
  it('counts confirmed products minus posted returns, no drafts or reversed lines', () => {
    expect(orderProductsNet({ items }).toFixed(2)).toBe('200.00');
  });

  it('is 0 without products', () => {
    expect(orderProductsNet({ items: [] }).toFixed(2)).toBe('0.00');
  });
});

describe('orderAmountDue', () => {
  it('counts every confirmed line of an active order', () => {
    expect(
      orderAmountDue({ status: OrderStatus.ACTIVE, items }).toFixed(2),
    ).toBe('1700.00');
  });

  it('is 0 for a voided order', () => {
    expect(
      orderAmountDue({ status: OrderStatus.VOIDED, items }).toFixed(2),
    ).toBe('0.00');
  });
});

describe('returnRefundAmount', () => {
  it('gives back the whole return of a paid order', () => {
    // Paid 600 for 600, 300 returned: due after the return 300.
    expect(returnRefundAmount(d('600'), d('300'), d('300')).toFixed(2)).toBe(
      '300.00',
    );
  });

  it('gives nothing back when the money was never received', () => {
    // Visit prepaid 2000, product 500 sold later without payment, product returned.
    expect(returnRefundAmount(d('2000'), d('2000'), d('500')).toFixed(2)).toBe(
      '0.00',
    );
  });

  it('gives back only the overpaid part of an underpaid order', () => {
    // Paid 2200 of 2500, 500 returned: due after 2000, 200 overpaid.
    expect(returnRefundAmount(d('2200'), d('2000'), d('500')).toFixed(2)).toBe(
      '200.00',
    );
  });

  it('never gives back more than the return', () => {
    // Overpaid before the return (cancelled paid visit): only the returned goods go back.
    expect(returnRefundAmount(d('3000'), d('0'), d('300')).toFixed(2)).toBe(
      '300.00',
    );
  });

  it('gives nothing for an unpaid order or free goods', () => {
    expect(returnRefundAmount(d('0'), d('0'), d('300')).toFixed(2)).toBe(
      '0.00',
    );
    expect(returnRefundAmount(d('600'), d('0'), d('0')).toFixed(2)).toBe(
      '0.00',
    );
  });
});
