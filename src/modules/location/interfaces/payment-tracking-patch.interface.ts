import { PaymentTrackingMode } from '../enums/payment-tracking-mode.enum.js';

/** Location fields written when the payment tracking mode is set. */
export interface PaymentTrackingPatch {
  paymentTrackingMode?: PaymentTrackingMode;
  paymentTrackingSince?: Date;
}
