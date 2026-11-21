import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { thrownAppException } from '../testing/thrown-app-exception.js';
import {
  assertPaymentVoidWithoutRefunds,
  assertVoidNotLinkedToReturn,
  isOperationVoided,
} from './payment-void.rules.js';

const voidedAt = new Date('2026-11-21T10:00:00.000Z');

describe('isOperationVoided', () => {
  it('is true when every record is voided', () => {
    expect(isOperationVoided({ payments: [{ voidedAt }] })).toBe(true);
  });

  it('is false while a record is active', () => {
    expect(
      isOperationVoided({ payments: [{ voidedAt }, { voidedAt: null }] }),
    ).toBe(false);
  });
});

describe('assertVoidNotLinkedToReturn', () => {
  it('allows an operation outside a product return', () => {
    expect(() =>
      assertVoidNotLinkedToReturn({ orderReturnId: null }),
    ).not.toThrow();
  });

  it('refuses the refund of a return: 409 PAYMENT_OPERATION_LINKED_TO_RETURN', () => {
    const error = thrownAppException(() =>
      assertVoidNotLinkedToReturn({ orderReturnId: 'return-1' }),
    );
    expect(error.errorCode).toBe(
      ErrorCode.PAYMENT_OPERATION_LINKED_TO_RETURN.code,
    );
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });
});

describe('assertPaymentVoidWithoutRefunds', () => {
  it('allows a payment of an order without active refunds', () => {
    expect(() => assertPaymentVoidWithoutRefunds(false)).not.toThrow();
  });

  it('refuses while refunds are active: 409 PAYMENT_VOID_HAS_REFUNDS', () => {
    const error = thrownAppException(() =>
      assertPaymentVoidWithoutRefunds(true),
    );
    expect(error.errorCode).toBe(ErrorCode.PAYMENT_VOID_HAS_REFUNDS.code);
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });
});
