import { Subscription } from '@prisma/client';

/** One event of a bulk insert: whose it is and what it says. */
export interface SubscriptionEventEntry {
  subscription: Pick<Subscription, 'id' | 'brandId'>;
  payload: Record<string, unknown>;
}
