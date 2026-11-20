import { DraftProductsAdded } from '../../orders/interfaces/draft-products-added.interface.js';
import { BookingWithItems } from './booking-with-items.interface.js';
import { VisitPaymentOutcome } from './visit-payment-outcome.interface.js';

export interface BookingCreationResult {
  booking: BookingWithItems;
  timezone: string;
  currency: string;
  bundleTitle: string | null;
  productsAdded: DraftProductsAdded | null;
  payment: VisitPaymentOutcome | null;
}
