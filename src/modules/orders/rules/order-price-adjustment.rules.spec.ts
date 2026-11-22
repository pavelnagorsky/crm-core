import { PriceAdjustmentKind, PriceValueType, Prisma } from '@prisma/client';
import { OrderPriceAdjustmentData } from '../interfaces/order-price-adjustment-data.interface.js';
import {
  orderLineAdjustments,
  sameAdjustments,
} from './order-price-adjustment.rules.js';

const d = (value: string) => new Prisma.Decimal(value);

function layer(
  sortOrder: number,
  kind: PriceAdjustmentKind,
  amount: string,
): OrderPriceAdjustmentData {
  return {
    sortOrder,
    kind,
    ruleId: `rule-${kind}`,
    title: kind,
    publicTitle: null,
    valueType: PriceValueType.PERCENT,
    value: d('10'),
    amount: d(amount),
  };
}

/** A booking item layer: carries its own id and owner besides the order line fields. */
function bookingLayer(
  sortOrder: number,
  kind: PriceAdjustmentKind,
  amount: string,
) {
  return {
    ...layer(sortOrder, kind, amount),
    id: `booking-layer-${sortOrder}`,
    bookingItemId: 'booking-item-1',
  };
}

describe('orderLineAdjustments', () => {
  const all = [
    bookingLayer(0, PriceAdjustmentKind.LEVEL, '5.00'),
    bookingLayer(1, PriceAdjustmentKind.STAFF, '5.00'),
    bookingLayer(2, PriceAdjustmentKind.SURCHARGE, '6.00'),
    bookingLayer(3, PriceAdjustmentKind.PROMOTION, '-7.00'),
    bookingLayer(4, PriceAdjustmentKind.CLIENT_DISCOUNT, '-3.00'),
  ];

  it('keeps every layer in order without a custom price', () => {
    expect(orderLineAdjustments(all, null)).toEqual([
      layer(0, PriceAdjustmentKind.LEVEL, '5.00'),
      layer(1, PriceAdjustmentKind.STAFF, '5.00'),
      layer(2, PriceAdjustmentKind.SURCHARGE, '6.00'),
      layer(3, PriceAdjustmentKind.PROMOTION, '-7.00'),
      layer(4, PriceAdjustmentKind.CLIENT_DISCOUNT, '-3.00'),
    ]);
  });

  it('drops discount layers with a custom price and renumbers the rest', () => {
    const discountFirst = [
      bookingLayer(0, PriceAdjustmentKind.PROMOTION, '-7.00'),
      bookingLayer(1, PriceAdjustmentKind.SURCHARGE, '6.00'),
    ];

    expect(orderLineAdjustments(all, d('45.00'))).toEqual([
      layer(0, PriceAdjustmentKind.LEVEL, '5.00'),
      layer(1, PriceAdjustmentKind.STAFF, '5.00'),
      layer(2, PriceAdjustmentKind.SURCHARGE, '6.00'),
    ]);
    expect(orderLineAdjustments(discountFirst, d('45.00'))).toEqual([
      layer(0, PriceAdjustmentKind.SURCHARGE, '6.00'),
    ]);
  });

  it('treats a zero custom price as a custom price', () => {
    expect(orderLineAdjustments(all, d('0'))).toHaveLength(3);
  });

  it('copies only order line fields', () => {
    const [copied] = orderLineAdjustments(
      [bookingLayer(0, PriceAdjustmentKind.SURCHARGE, '6.00')],
      null,
    );

    expect(Object.keys(copied).sort()).toEqual(
      [
        'amount',
        'kind',
        'publicTitle',
        'ruleId',
        'sortOrder',
        'title',
        'value',
        'valueType',
      ].sort(),
    );
  });

  it('returns no layers for none', () => {
    expect(orderLineAdjustments([], null)).toEqual([]);
    expect(orderLineAdjustments([], d('10'))).toEqual([]);
  });
});

describe('sameAdjustments', () => {
  const base = [
    layer(0, PriceAdjustmentKind.SURCHARGE, '6.00'),
    layer(1, PriceAdjustmentKind.PROMOTION, '-7.00'),
  ];

  it('matches equal layers, comparing decimals by value', () => {
    const stored = base.map((item) => ({
      ...item,
      value: item.value === null ? null : d(item.value.toFixed(2)),
      amount: d(item.amount.toString()),
    }));

    expect(sameAdjustments(stored, base)).toBe(true);
    expect(sameAdjustments([], [])).toBe(true);
  });

  it('matches layers without a value', () => {
    const fixed = [{ ...base[0], valueType: null, value: null }];

    expect(sameAdjustments(fixed, [{ ...fixed[0] }])).toBe(true);
  });

  it.each<[string, OrderPriceAdjustmentData[]]>([
    ['a missing layer', [base[0]]],
    ['an extra layer', [...base, layer(2, PriceAdjustmentKind.STAFF, '1.00')]],
    ['another order', [base[1], base[0]]],
    ['another sortOrder', [base[0], { ...base[1], sortOrder: 2 }]],
    [
      'another kind',
      [base[0], { ...base[1], kind: PriceAdjustmentKind.CLIENT_DISCOUNT }],
    ],
    ['another rule', [base[0], { ...base[1], ruleId: 'rule-other' }]],
    ['no rule', [base[0], { ...base[1], ruleId: null }]],
    ['another title', [base[0], { ...base[1], title: 'Other' }]],
    ['another public title', [base[0], { ...base[1], publicTitle: 'Promo' }]],
    [
      'another value type',
      [base[0], { ...base[1], valueType: PriceValueType.AMOUNT }],
    ],
    ['another value', [base[0], { ...base[1], value: d('15') }]],
    ['no value', [base[0], { ...base[1], value: null }]],
    ['another amount', [base[0], { ...base[1], amount: d('-8.00') }]],
  ])('does not match %s', (_case, expected) => {
    expect(sameAdjustments(base, expected)).toBe(false);
    expect(sameAdjustments(expected, base)).toBe(false);
  });
});
