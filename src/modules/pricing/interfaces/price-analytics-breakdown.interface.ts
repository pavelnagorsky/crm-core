import { Prisma } from '@prisma/client';
import { PriceAnalyticsChange } from './price-analytics-change.interface.js';

/**
 * One item split into regular + surcharges - discounts = received, all non-negative; the
 * changes add up to surcharges and discounts, surcharges first.
 */
export interface PriceAnalyticsBreakdown {
  regular: Prisma.Decimal;
  surcharges: Prisma.Decimal;
  discounts: Prisma.Decimal;
  received: Prisma.Decimal;
  changes: PriceAnalyticsChange[];
}
