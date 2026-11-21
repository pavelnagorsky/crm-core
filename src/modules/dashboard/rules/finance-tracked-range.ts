import { PaymentTrackingMode } from '../../location/enums/payment-tracking-mode.enum.js';
import { PaymentTracking } from '../../location/interfaces/payment-tracking.interface.js';
import { FinanceRange } from '../../orders/aggregates/interfaces/finance-range.interface.js';

/**
 * The part of the range whose visits (by start) and sales (by date) are in payment tracking:
 * from the later of the range start and the tracking start. Null when nothing is tracked.
 */
export function trackedRange(
  range: FinanceRange,
  tracking: PaymentTracking,
): FinanceRange | null {
  if (tracking.mode === PaymentTrackingMode.DISABLED) return null;
  const from =
    tracking.since.getTime() > range.from.getTime() ? tracking.since : range.from;
  return from.getTime() < range.to.getTime() ? { ...range, from } : null;
}
