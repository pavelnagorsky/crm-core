export interface PaymentProviderCapabilities {
  /** Can be selected as settings.paymentProvider for owner requests. */
  ownerInitiated: boolean;
  /** A platform admin marks the payment as paid. */
  adminConfirmable: boolean;
  webhooks: boolean;
  statusPolling: boolean;
  recurring: boolean;
}
