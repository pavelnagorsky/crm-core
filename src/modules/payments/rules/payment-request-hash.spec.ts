import { PaymentMethod } from '@prisma/client';
import { PaymentInputMethod } from '../enums/payment-input-method.enum.js';
import {
  paymentRequestHash,
  refundRequestHash,
} from './payment-request-hash.js';

describe('paymentRequestHash', () => {
  const details = {
    method: PaymentInputMethod.MIXED,
    cashAmount: '1000.00',
    cardAmount: '2000.00',
    occurredAt: '2026-11-19T18:30:00',
  };
  const base = paymentRequestHash({ bookingId: 'booking-1' }, details, [
    'item-1',
  ]);

  it('is stable and ignores the order of confirmed items', () => {
    expect(
      paymentRequestHash({ bookingId: 'booking-1' }, details, ['item-1']),
    ).toBe(base);
    expect(paymentRequestHash({ bookingId: 'b' }, details, ['x', 'y'])).toBe(
      paymentRequestHash({ bookingId: 'b' }, details, ['y', 'x']),
    );
  });

  it('normalizes amounts', () => {
    expect(
      paymentRequestHash(
        { bookingId: 'booking-1' },
        { ...details, cashAmount: '1000' },
        ['item-1'],
      ),
    ).toBe(base);
  });

  it.each([
    ['target', { orderId: 'booking-1' }, details, ['item-1']],
    ['booking', { bookingId: 'booking-2' }, details, ['item-1']],
    [
      'method',
      { bookingId: 'booking-1' },
      { ...details, method: PaymentInputMethod.CASH },
      ['item-1'],
    ],
    [
      'cash part',
      { bookingId: 'booking-1' },
      { ...details, cashAmount: '1000.01' },
      ['item-1'],
    ],
    [
      'card part',
      { bookingId: 'booking-1' },
      { ...details, cardAmount: '1999.99' },
      ['item-1'],
    ],
    [
      'explicit date',
      { bookingId: 'booking-1' },
      { ...details, occurredAt: null },
      ['item-1'],
    ],
    ['confirmed items', { bookingId: 'booking-1' }, details, []],
  ])('changes with the %s', (_, target, changed, items) => {
    expect(
      paymentRequestHash(
        target as { bookingId: string },
        changed,
        items as string[],
      ),
    ).not.toBe(base);
  });
});

describe('refundRequestHash', () => {
  const details = {
    method: PaymentMethod.CARD,
    amount: '500.00',
    occurredAt: null,
    reason: 'Отказ',
  };
  const base = refundRequestHash('order-1', details);

  it('normalizes the amount and the reason', () => {
    expect(
      refundRequestHash('order-1', {
        ...details,
        amount: '500',
        reason: ' Отказ ',
      }),
    ).toBe(base);
  });

  it.each([
    ['order', 'order-2', details],
    ['method', 'order-1', { ...details, method: PaymentMethod.CASH }],
    ['amount', 'order-1', { ...details, amount: '499.99' }],
    ['date', 'order-1', { ...details, occurredAt: '2026-11-20T10:00:00' }],
    ['reason', 'order-1', { ...details, reason: null }],
  ])('changes with the %s', (_, orderId, changed) => {
    expect(refundRequestHash(orderId, changed)).not.toBe(base);
  });
});
