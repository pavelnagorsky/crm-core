/** Payment state derived from the amount due and the active journal records. Never stored. */
export enum PaymentStatus {
  /** No active records and nothing is due. */
  NOT_REQUIRED = 'NOT_REQUIRED',
  /** No active records, something is due, and payment is tracked. */
  NOT_SPECIFIED = 'NOT_SPECIFIED',
  /** No active records, something is due, and the visit or sale is not in payment tracking. */
  NOT_TRACKED = 'NOT_TRACKED',
  /** Records exist and the paid amount equals the amount due. */
  PAID = 'PAID',
  /** Records exist and less than the amount due is paid. */
  UNDERPAID = 'UNDERPAID',
  /** Records exist and more than the amount due is paid. */
  OVERPAID = 'OVERPAID',
}
