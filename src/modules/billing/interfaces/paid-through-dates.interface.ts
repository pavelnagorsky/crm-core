/** Subscription dates that follow from a new paidUntil. */
export interface PaidThroughDates {
  paidUntil: Date;
  accessEndsAt: Date;
  billingAnchorDay: number;
}
