import { PaymentTrackingMode } from '../enums/payment-tracking-mode.enum.js';
import { PaymentTrackingPatch } from '../interfaces/payment-tracking-patch.interface.js';

/**
 * The fields to write when the mode is set; empty when nothing changes. Turning tracking on
 * starts it now, so the time it was off never becomes "not specified". Turning it off keeps
 * the last start.
 */
export function paymentTrackingPatch(
  current: PaymentTrackingMode,
  requested: PaymentTrackingMode | undefined,
  now: Date,
): PaymentTrackingPatch {
  if (requested === undefined || requested === current) return {};
  if (requested === PaymentTrackingMode.MANUAL)
    return { paymentTrackingMode: requested, paymentTrackingSince: now };
  return { paymentTrackingMode: requested };
}
