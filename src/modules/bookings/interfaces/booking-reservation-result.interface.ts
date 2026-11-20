import { DraftProductsAdded } from '../../orders/interfaces/draft-products-added.interface.js';
import { BookingWithItems } from './booking-with-items.interface.js';
import { VisitPaymentOutcome } from './visit-payment-outcome.interface.js';

export interface BookingReservationResult {
  booking: BookingWithItems;
  /** Draft products added to the visit order; their audit is published after commit. */
  productsAdded: DraftProductsAdded | null;
  /** Confirmed products and payment of a manual booking; null without that step. */
  payment: VisitPaymentOutcome | null;
}
