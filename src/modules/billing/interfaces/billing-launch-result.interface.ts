export interface BillingLaunchResult {
  launchedAt: Date;
  /** Subscriptions created by this pass. */
  created: number;
  /** Brands that still have no subscription after this pass. */
  remaining: number;
}
