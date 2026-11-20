import { PaymentChange } from '../../payments/interfaces/payment-change.interface.js';

/** Outcome of voiding a payment operation through the order endpoint. */
export interface OrderPaymentVoidResult {
  /** Null when nothing was active any more. */
  change: PaymentChange | null;
  /** The visit of a visit order, for the audit entry. */
  bookingId: string | null;
}
