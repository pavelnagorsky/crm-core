import { PaymentInputMethod } from '../enums/payment-input-method.enum.js';

/** How a payment is split between the methods, as entered. */
export interface PaymentSplit {
  method: PaymentInputMethod;
  /** Canonical 2dp strings; set only for MIXED. */
  cashAmount?: string | null;
  cardAmount?: string | null;
}
