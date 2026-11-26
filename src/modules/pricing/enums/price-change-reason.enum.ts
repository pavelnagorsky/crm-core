/** What moved the price of an item away from its regular price (docs/pricing-stage8-api.md). */
export enum PriceChangeReason {
  PROMOTION = 'PROMOTION',
  SURCHARGE = 'SURCHARGE',
  CLIENT_DISCOUNT = 'CLIENT_DISCOUNT',
  CUSTOM_PRICE_DOWN = 'CUSTOM_PRICE_DOWN',
  CUSTOM_PRICE_UP = 'CUSTOM_PRICE_UP',
}
