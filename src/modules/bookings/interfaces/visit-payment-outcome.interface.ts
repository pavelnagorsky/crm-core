import { OrderWithItems } from '../../orders/interfaces/order-with-items.interface.js';
import { PaymentChange } from '../../payments/interfaces/payment-change.interface.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingWithItems } from './booking-with-items.interface.js';

/** Effects of a visit payment step, for the response and the audit after commit. */
export interface VisitPaymentOutcome {
  /** The booking after the step: completed when the payment completed it. */
  booking: BookingWithItems;
  /** Status the payment completed the visit from, or null. */
  completedFrom: BookingStatus | null;
  /** The visit order, null when the step needed none. */
  order: OrderWithItems | null;
  confirmedItemIds: string[];
  /** Confirmed lines whose total at confirmation differs from the draft. */
  repricedItemIds: string[];
  /** The journal write; null for a retry or a step without payment. */
  change: PaymentChange | null;
  /** The recorded or replayed payment operation. */
  operationId: string | null;
}
