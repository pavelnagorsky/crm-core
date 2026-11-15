/** Subscription fields the state, period and notice rules read. */
export interface SubscriptionDates {
  timezone: string;
  trialEndsAt: Date;
  paidUntil: Date | null;
  accessEndsAt: Date;
  graceExtendedUntil: Date | null;
  suspendedAt: Date | null;
}
