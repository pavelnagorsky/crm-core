import { PaymentNextActionType } from '../enums/payment-next-action-type.enum.js';

export interface InstructionsNextAction {
  type: PaymentNextActionType.INSTRUCTIONS;
  instructions: string | null;
  /** KL-000123, for the payment purpose. */
  reference: string;
  amount: string;
  currency: string;
  expiresAt: Date | null;
}
