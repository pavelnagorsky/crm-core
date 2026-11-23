import { Prisma } from '@prisma/client';

/** What one rule added to the visits of a period; the bookings module computes it. */
export interface PriceRuleSurchargeStats {
  ruleId: string;
  /** Sum of the surcharge layers of the rule. */
  amount: Prisma.Decimal;
  /** Distinct bookings the rule touched. */
  bookingsCount: number;
}
