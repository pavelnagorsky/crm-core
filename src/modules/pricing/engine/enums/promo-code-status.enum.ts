/** What a promo code did to a visit. */
export enum PromoCodeStatus {
  /** Its promotion applies to at least one line. */
  APPLIED = 'APPLIED',
  /** It applies, but a bigger discount won on every line. */
  BETTER_APPLIED = 'BETTER_APPLIED',
  /** A promotion has this code, its conditions do not hold (reason). */
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  /** No live promotion of the location has this code. */
  NOT_FOUND = 'NOT_FOUND',
}
