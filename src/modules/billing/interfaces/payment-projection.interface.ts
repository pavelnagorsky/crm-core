import { BillingPeriodResult } from './billing-period-result.interface.js';

/** What a payment would do to a subscription, computed without writing. */
export interface PaymentProjection {
  period: BillingPeriodResult;
  /** paidUntil after converting the remainder to the payment plan, when it happens. */
  convertedPaidUntil: Date | null;
  /** The remainder had to be converted but a price was missing; applied without conversion. */
  conversionFailed: boolean;
}
