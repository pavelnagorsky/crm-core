import { Prisma } from '@prisma/client';
import { PaymentInputDto } from '../../payments/dto/payment-input.dto.js';
import { PaymentRequest } from '../../payments/interfaces/payment-request.interface.js';

/**
 * What a booking write does with the visit order after saving the booking: confirm product
 * lines, then record the payment. Validated before any lock.
 */
export interface VisitPaymentPlan {
  /** Null when the write only confirms products. */
  payment: {
    input: PaymentInputDto;
    request: PaymentRequest;
  } | null;
  /** Draft product lines of the visit order to confirm. */
  confirmProductItemIds: string[];
  /** Confirm every draft product line (manual creation with confirmProducts). */
  confirmAllDraftProducts: boolean;
  /** Σ lineTotal of the confirmed lines the caller saw (409 PRICE_CHANGED otherwise). */
  expectedProductTotal: Prisma.Decimal | null;
  /** Whether an active payment may be replaced (order:write). */
  canReplace: boolean;
  timezone: string;
  now: Date;
}
