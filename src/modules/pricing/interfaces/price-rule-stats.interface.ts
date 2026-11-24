import { Prisma } from '@prisma/client';

/** What one rule did to the visits of the last 30 days; the bookings module computes it. */
export interface PriceRuleStats {
  ruleId: string;
  /** Surcharge added, or discount given (positive), by the layers of the rule. */
  amount: Prisma.Decimal;
  /** Distinct bookings the rule touched. */
  bookingsCount: number;
  /** Promotions: what the items with the promotion cost the clients. */
  revenue: Prisma.Decimal;
  /** Promotions: clients for whom such a booking was the first in the brand. */
  newClients: number;
  /** Promotions: live bookings with the promotion, all time (for "34 of 100"). */
  usageCount: number;
}
