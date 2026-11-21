import { OrderPaymentTotals } from '../../payments/interfaces/order-payment-totals.interface.js';

/** What `OrderResponseDto.payment` is built from besides the order itself. */
export interface OrderPaymentView {
  /** Active journal of the order; null when nothing is recorded. */
  totals: OrderPaymentTotals | null;
  /** The order is in payment tracking of its location. */
  tracked: boolean;
}
