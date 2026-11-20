import { PaymentInputDto } from '../../payments/dto/payment-input.dto.js';

/** What a booking write asks of the payment step. */
export interface VisitPaymentPlanInput {
  payment?: PaymentInputDto | null;
  confirmProductItemIds?: string[] | null;
  confirmAllDraftProducts?: boolean;
}
