import { Prisma } from '@prisma/client';

/** What a subscription pays for a plan and period today. */
export interface SubscriptionPrice {
  countryCode: string;
  currency: string;
  amount: Prisma.Decimal;
}
