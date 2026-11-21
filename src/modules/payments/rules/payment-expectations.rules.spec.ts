import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PaymentInputMethod } from '../enums/payment-input-method.enum.js';
import { thrownAppException } from '../testing/thrown-app-exception.js';
import {
  assertExpectedAmount,
  assertNoPaymentExpected,
  paymentExpectations,
} from './payment-expectations.rules.js';

const d = (value: string) => new Prisma.Decimal(value);

describe('paymentExpectations', () => {
  it('reads nothing from a plain request', () => {
    expect(paymentExpectations({ method: PaymentInputMethod.CARD })).toEqual({
      expectedAmount: null,
      expectNoPayment: false,
    });
  });

  it.each([PaymentInputMethod.CASH, PaymentInputMethod.CARD])(
    'takes the shown amount with %s',
    (method) => {
      const result = paymentExpectations({
        method,
        expectedAmount: '1500.00',
        expectNoPayment: true,
      });
      expect(result.expectedAmount?.toFixed(2)).toBe('1500.00');
      expect(result.expectNoPayment).toBe(true);
    },
  );

  it('refuses a shown amount with MIXED: 400 PAYMENT_SPLIT_INVALID', () => {
    const error = thrownAppException(() =>
      paymentExpectations({
        method: PaymentInputMethod.MIXED,
        expectedAmount: '1500.00',
      }),
    );
    expect(error.errorCode).toBe(ErrorCode.PAYMENT_SPLIT_INVALID.code);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });
});

describe('assertNoPaymentExpected', () => {
  it('passes without an active payment', () => {
    expect(() =>
      assertNoPaymentExpected({ expectNoPayment: true }, null),
    ).not.toThrow();
  });

  it('passes an active payment when none was expected', () => {
    expect(() =>
      assertNoPaymentExpected({ expectNoPayment: false }, 'op-1'),
    ).not.toThrow();
  });

  it('refuses an active payment: 409 PAYMENT_ALREADY_RECORDED with operationId', () => {
    const error = thrownAppException(() =>
      assertNoPaymentExpected({ expectNoPayment: true }, 'op-1'),
    );
    expect(error.errorCode).toBe(ErrorCode.PAYMENT_ALREADY_RECORDED.code);
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.payload).toEqual({ operationId: 'op-1' });
  });
});

describe('assertExpectedAmount', () => {
  it('passes without a shown amount', () => {
    expect(() =>
      assertExpectedAmount({ expectedAmount: null }, d('1500'), d('1500')),
    ).not.toThrow();
  });

  it('passes when the shown amount is the required amount', () => {
    expect(() =>
      assertExpectedAmount(
        { expectedAmount: d('1500.00') },
        d('1500'),
        d('1500'),
      ),
    ).not.toThrow();
  });

  it('compares with the required amount, refunds included', () => {
    expect(() =>
      assertExpectedAmount(
        { expectedAmount: d('2000.00') },
        d('2000'),
        d('1500'),
      ),
    ).not.toThrow();
    const error = thrownAppException(() =>
      assertExpectedAmount(
        { expectedAmount: d('1500.00') },
        d('2000'),
        d('1500'),
      ),
    );
    expect(error.errorCode).toBe(ErrorCode.PAYMENT_AMOUNT_MISMATCH.code);
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.payload).toEqual({
      amountDue: '1500.00',
      requiredAmount: '2000.00',
    });
  });
});
