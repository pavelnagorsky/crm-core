/** A client the price check imagines when no clientId is given. */
export enum PriceExplainClientType {
  /** Known, no bookings yet. */
  NEW = 'NEW',
  /** Known, has booked before. */
  REGULAR = 'REGULAR',
}
