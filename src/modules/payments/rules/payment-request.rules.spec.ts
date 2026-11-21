import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PaymentInputMethod } from '../enums/payment-input-method.enum.js';
import { thrownAppException } from '../testing/thrown-app-exception.js';
import { paymentRequest } from './payment-request.rules.js';

describe('paymentRequest', () => {
  const at = new Date('2026-11-21T10:00:00.000Z');

  it('builds a plain request without expectations', () => {
    expect(paymentRequest({ method: PaymentInputMethod.CASH }, at)).toEqual({
      method: PaymentInputMethod.CASH,
      cashAmount: null,
      cardAmount: null,
      occurredAt: at,
      expectedAmount: null,
      expectNoPayment: false,
    });
  });

  it('carries the expectations of a one-click payment', () => {
    const request = paymentRequest(
      {
        method: PaymentInputMethod.CARD,
        expectedAmount: '1500.00',
        expectNoPayment: true,
      },
      null,
    );
    expect(request.expectedAmount?.toFixed(2)).toBe('1500.00');
    expect(request.expectNoPayment).toBe(true);
  });

  it('checks the split first', () => {
    const error = thrownAppException(() =>
      paymentRequest(
        { method: PaymentInputMethod.CARD, cashAmount: '10.00' },
        null,
      ),
    );
    expect(error.errorCode).toBe(ErrorCode.PAYMENT_SPLIT_INVALID.code);
  });
});
