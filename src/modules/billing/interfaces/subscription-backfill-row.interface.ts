/** One brand of the launch backfill (plan section 13). */
export interface SubscriptionBackfillRow {
  brandId: string;
  /** Set only on the oldest brand of an owner whose trial is still free. */
  trialUserId: string | null;
  countryCode: string;
  timezone: string;
}
