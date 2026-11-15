import { SubscriptionState } from '../enums/subscription-state.enum.js';

/** State computed for a given moment. Dates are null only in FREE. */
export interface SubscriptionStateView {
  state: SubscriptionState;
  /** EXPIRED or SUSPENDED while enforcement is on. */
  isBlocked: boolean;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  accessEndsAt: Date | null;
  graceEndsAt: Date | null;
  /** Local "YYYY-MM-DD" of the last day with access, inclusive. */
  lastAccessDate: string | null;
  /** Calendar days until access ends (TRIAL, ACTIVE) or until grace ends (PAST_DUE). */
  daysLeft: number | null;
}
