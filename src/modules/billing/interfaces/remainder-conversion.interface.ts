import { Subscription } from '@prisma/client';
import { PaymentProjection } from './payment-projection.interface.js';

/** The subscription once its paid remainder moved to the payment plan. */
export interface RemainderConversion extends Omit<PaymentProjection, 'period'> {
  current: Subscription;
}
