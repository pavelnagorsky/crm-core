import { SubscriptionPayment } from '@prisma/client';
import { PaymentNextAction } from './payment-next-action.type.js';

export interface PaymentWithNextAction {
  payment: SubscriptionPayment;
  nextAction: PaymentNextAction;
}
