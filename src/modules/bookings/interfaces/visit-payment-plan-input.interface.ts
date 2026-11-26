import { PaymentInputDto } from '../../payments/dto/payment-input.dto.js';

/** What a booking write asks of the payment step. */
export interface VisitPaymentPlanInput {
  payment?: PaymentInputDto | null;
  confirmProductItemIds?: string[] | null;
  confirmAllDraftProducts?: boolean;
  /** Σ lineTotal of the confirmed lines the caller saw; required when products are confirmed. */
  expectedProductTotal?: string | null;
}
