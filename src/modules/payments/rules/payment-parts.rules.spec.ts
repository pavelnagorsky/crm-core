import { PaymentMethod, Prisma } from '@prisma/client';
import { PaymentInputMethod } from '../enums/payment-input-method.enum.js';
import {
  assertPaymentSplit,
  resolvePaymentParts,
} from './payment-parts.rules.js';

const d = (value: string) => new Prisma.Decimal(value);

describe('assertPaymentSplit', () => {
  it.each([
    [{ method: PaymentInputMethod.CASH }],
    [{ method: PaymentInputMethod.CARD, cashAmount: null, cardAmount: null }],
    [
      {
        method: PaymentInputMethod.MIXED,
        cashAmount: '0.01',
        cardAmount: '10.00',
      },
    ],
  ])('accepts %o', (split) => {
    expect(() => assertPaymentSplit(split)).not.toThrow();
  });

  it.each([
    [{ method: PaymentInputMethod.CASH, cashAmount: '10.00' }],
    [{ method: PaymentInputMethod.CARD, cardAmount: '10.00' }],
    [{ method: PaymentInputMethod.MIXED, cashAmount: '10.00' }],
    [{ method: PaymentInputMethod.MIXED, cardAmount: '10.00' }],
    [
      {
        method: PaymentInputMethod.MIXED,
        cashAmount: '0.00',
        cardAmount: '10.00',
      },
    ],
    [
      {
        method: PaymentInputMethod.MIXED,
        cashAmount: '10.00',
        cardAmount: '0.00',
      },
    ],
  ])('rejects %o with PAYMENT_SPLIT_INVALID', (split) => {
    expect(() => assertPaymentSplit(split)).toThrow(
      expect.objectContaining({
        errorCode: 'PAYMENT_SPLIT_INVALID',
        status: 400,
      }),
    );
  });
});

describe('resolvePaymentParts', () => {
  it('saves a single method as a snapshot of the required amount', () => {
    expect(
      resolvePaymentParts(
        { method: PaymentInputMethod.CARD },
        d('3000.00'),
        d('3000.00'),
      ),
    ).toEqual([{ method: PaymentMethod.CARD, amount: d('3000.00') }]);
  });

  it('splits a mixed payment into cash and card records', () => {
    const parts = resolvePaymentParts(
      {
        method: PaymentInputMethod.MIXED,
        cashAmount: '1000.00',
        cardAmount: '2000.00',
      },
      d('3000'),
      d('3000'),
    );
    expect(parts.map((part) => [part.method, part.amount.toFixed(2)])).toEqual([
      [PaymentMethod.CASH, '1000.00'],
      [PaymentMethod.CARD, '2000.00'],
    ]);
  });

  it('answers a mismatch with both amounts', () => {
    expect(() =>
      resolvePaymentParts(
        {
          method: PaymentInputMethod.MIXED,
          cashAmount: '1000.00',
          cardAmount: '1999.99',
        },
        d('3500'),
        d('3000'),
      ),
    ).toThrow(
      expect.objectContaining({
        errorCode: 'PAYMENT_AMOUNT_MISMATCH',
        status: 409,
        payload: { amountDue: '3000.00', requiredAmount: '3500.00' },
      }),
    );
  });

  it('checks the split shape before the amounts', () => {
    expect(() =>
      resolvePaymentParts(
        { method: PaymentInputMethod.CASH, cashAmount: '3000.00' },
        d('3000'),
        d('3000'),
      ),
    ).toThrow(expect.objectContaining({ errorCode: 'PAYMENT_SPLIT_INVALID' }));
  });
});
