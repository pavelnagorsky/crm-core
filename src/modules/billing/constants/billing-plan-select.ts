import { Prisma } from '@prisma/client';

export const BILLING_PLAN_WITH_PRICES_INCLUDE = {
  prices: { orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.BillingPlanInclude;

export const SUBSCRIPTION_WITH_PLAN_INCLUDE = {
  plan: true,
} satisfies Prisma.SubscriptionInclude;
