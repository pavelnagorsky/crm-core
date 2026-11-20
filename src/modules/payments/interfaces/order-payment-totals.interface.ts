import { PaymentOperationWithPayments } from './payment-operation-with-payments.interface.js';
import { PaymentTotals } from './payment-totals.interface.js';

/** Active journal of one order. Operations carry only their active records. */
export interface OrderPaymentTotals extends PaymentTotals {
  orderId: string;
  payment: PaymentOperationWithPayments | null;
  refunds: PaymentOperationWithPayments[];
}
