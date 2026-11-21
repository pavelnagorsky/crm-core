import { PaymentTrackingMode } from '../enums/payment-tracking-mode.enum.js';

/** Payment tracking of a location: visits from `since` by start, sales by date. */
export interface PaymentTracking {
  mode: PaymentTrackingMode;
  /** Start of tracking. Not used while the mode is DISABLED. */
  since: Date;
}
