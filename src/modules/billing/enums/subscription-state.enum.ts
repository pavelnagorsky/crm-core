/** Computed from dates on every read, never stored. */
export enum SubscriptionState {
  FREE = 'FREE',
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
}
