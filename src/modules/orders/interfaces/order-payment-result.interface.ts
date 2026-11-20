import { PaymentChange } from '../../payments/interfaces/payment-change.interface.js';

/** Outcome of a payment or a refund through the order endpoints. */
export interface OrderPaymentResult {
  /** The recorded or replayed operation. */
  operationId: string;
  /** The journal write; null for a retry. */
  change: PaymentChange | null;
  /** The visit of a visit order, for the audit entry. */
  bookingId: string | null;
}
