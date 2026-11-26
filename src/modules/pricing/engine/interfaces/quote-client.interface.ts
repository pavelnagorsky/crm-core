/** The client of a visit or a sale as discounts see it. */
export interface QuoteClient {
  /** False: not known yet (online before the phone is entered); no client conditions hold. */
  known: boolean;
  /** No live bookings in the brand before this one; imported clients never are. */
  isNew: boolean;
  /** MM-DD, null when the birth date is not known. */
  birthday: string | null;
  /** Personal discount on services in basis points; null = none. */
  servicesDiscountBp: number | null;
  /** Personal discount on products in basis points; null = none. */
  productsDiscountBp: number | null;
}
