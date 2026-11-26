/** Where a product of the price check is sold (docs/pricing-stage7-api.md, «Проверка цены»). */
export enum PriceExplainProductContext {
  /** A separate sale at the desk: channel ADMIN, no visit (lead time gives NO_VISIT). */
  SALE = 'SALE',
  /** A product in a booking: the visit start, channel and booking moment of the request. */
  BOOKING = 'BOOKING',
}
