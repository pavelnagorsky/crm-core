import { PaymentNextActionType } from '../enums/payment-next-action-type.enum.js';

export interface RedirectNextAction {
  type: PaymentNextActionType.REDIRECT;
  url: string;
  expiresAt: Date | null;
}
