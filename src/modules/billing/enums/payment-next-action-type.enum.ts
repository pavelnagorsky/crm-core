export enum PaymentNextActionType {
  /** Offline: show the instructions and the payment number. */
  INSTRUCTIONS = 'INSTRUCTIONS',
  /** Online provider: send the owner to the payment page. */
  REDIRECT = 'REDIRECT',
  /** The payment is no longer pending. */
  NONE = 'NONE',
}
