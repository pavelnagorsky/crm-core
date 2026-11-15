import { SubscriptionEvent, SubscriptionPayment } from '@prisma/client';
import { AdminSubscriptionItem } from './admin-subscription-item.interface.js';

export interface AdminSubscriptionDetails extends AdminSubscriptionItem {
  pricingCountry: string;
  currency: string;
  /** Latest payments, newest first. */
  payments: SubscriptionPayment[];
  /** Latest events, newest first. */
  events: SubscriptionEvent[];
}
