import { PaymentTrackingMode } from '../enums/payment-tracking-mode.enum.js';
import { paymentTrackingPatch } from './payment-tracking-switch.js';

describe('paymentTrackingPatch', () => {
  const now = new Date('2026-11-21T09:30:00.000Z');

  it.each([
    [PaymentTrackingMode.MANUAL, undefined],
    [PaymentTrackingMode.DISABLED, undefined],
    [PaymentTrackingMode.MANUAL, PaymentTrackingMode.MANUAL],
    [PaymentTrackingMode.DISABLED, PaymentTrackingMode.DISABLED],
  ])('writes nothing from %s when %s is requested', (current, requested) => {
    expect(paymentTrackingPatch(current, requested, now)).toEqual({});
  });

  it('starts tracking now when it is turned on', () => {
    expect(
      paymentTrackingPatch(
        PaymentTrackingMode.DISABLED,
        PaymentTrackingMode.MANUAL,
        now,
      ),
    ).toEqual({
      paymentTrackingMode: PaymentTrackingMode.MANUAL,
      paymentTrackingSince: now,
    });
  });

  it('keeps the start when tracking is turned off', () => {
    expect(
      paymentTrackingPatch(
        PaymentTrackingMode.MANUAL,
        PaymentTrackingMode.DISABLED,
        now,
      ),
    ).toEqual({ paymentTrackingMode: PaymentTrackingMode.DISABLED });
  });
});
