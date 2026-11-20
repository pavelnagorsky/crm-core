/** Order history entry of a money journal write (PAYMENT_* events). Amounts are 2dp strings. */
export interface PaymentAuditPayload {
  operationId: string;
  /** PAYMENT or REFUND. */
  operationType: string;
  bookingId: string | null;
  parts: Array<{ method: string; amount: string }>;
  /** When the money changed hands, ISO. */
  occurredAt: string | null;
  amountDue: string | null;
  currency: string;
  reason: string | null;
  orderReturnId: string | null;
  /** The payment a replacement voided. */
  previousOperationId: string | null;
  previousParts: Array<{ method: string; amount: string }> | null;
}
