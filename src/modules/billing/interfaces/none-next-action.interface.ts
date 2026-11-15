import { PaymentNextActionType } from '../enums/payment-next-action-type.enum.js';

export interface NoneNextAction {
  type: PaymentNextActionType.NONE;
}
