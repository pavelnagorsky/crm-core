/** The client of a visit as discounts see it. */
export interface QuoteClient {
  /** False: not known yet (online before the phone is entered); no client conditions hold. */
  known: boolean;
  /** No live bookings in the brand before this one; imported clients never are. */
  isNew: boolean;
  /** MM-DD, null when the birth date is not known. */
  birthday: string | null;
  /** Personal discount in basis points; null = none. */
  discountBp: number | null;
}
