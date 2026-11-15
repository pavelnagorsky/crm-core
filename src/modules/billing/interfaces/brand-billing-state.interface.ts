import { BillingSettings } from '@prisma/client';
import { EffectiveLimits } from './effective-limits.interface.js';
import { SubscriptionSnapshot } from './subscription-snapshot.interface.js';
import { SubscriptionStateView } from './subscription-state-view.interface.js';

/** Everything a brand screen needs, computed for one moment from cached rows. */
export interface BrandBillingState {
  snapshot: SubscriptionSnapshot;
  settings: BillingSettings;
  view: SubscriptionStateView;
  /** Limits that apply now: none in FREE, TRIAL and while enforcement is off. */
  limits: EffectiveLimits;
}
