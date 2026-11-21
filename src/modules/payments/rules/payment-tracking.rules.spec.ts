import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PaymentTrackingMode } from '../../location/enums/payment-tracking-mode.enum.js';
import { thrownAppException } from '../testing/thrown-app-exception.js';
import {
  assertPaymentTrackingEnabled,
  isPaymentTracked,
} from './payment-tracking.rules.js';

const since = new Date('2026-11-21T09:30:00.000Z');
const manual = { mode: PaymentTrackingMode.MANUAL, since };
const disabled = { mode: PaymentTrackingMode.DISABLED, since };

describe('isPaymentTracked', () => {
  it.each([
    ['before', new Date(since.getTime() - 1), false],
    ['exactly at', since, true],
    ['after', new Date(since.getTime() + 1), true],
  ])('MANUAL: a moment %s the start is tracked: %s', (_, at, expected) => {
    expect(isPaymentTracked(manual, at)).toBe(expected);
  });

  it('DISABLED tracks nothing', () => {
    expect(isPaymentTracked(disabled, since)).toBe(false);
    expect(isPaymentTracked(disabled, new Date(since.getTime() + 1))).toBe(
      false,
    );
  });
});

describe('assertPaymentTrackingEnabled', () => {
  it('passes for MANUAL', () => {
    expect(() => assertPaymentTrackingEnabled(manual)).not.toThrow();
  });

  it('refuses DISABLED with 409 PAYMENT_TRACKING_DISABLED', () => {
    const error = thrownAppException(() =>
      assertPaymentTrackingEnabled(disabled),
    );
    expect(error.errorCode).toBe(ErrorCode.PAYMENT_TRACKING_DISABLED.code);
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });
});
