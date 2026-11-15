import { SubscriptionStateView } from './subscription-state-view.interface.js';

/** One brand of GET /users/me/subscription-states. */
export interface SubscriptionStateItem {
  brandId: string;
  view: SubscriptionStateView;
  overLimit: boolean;
  hasPendingPayment: boolean;
  isOwner: boolean;
}
