import { Prisma } from '@prisma/client';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';
import { PriceAnalyticsRuleInfo } from './price-analytics-rule-info.interface.js';

export interface PriceAnalyticsReasonRow {
  reason: PriceChangeReason;
  /** The rule of a PROMOTION or SURCHARGE row; null for other reasons and deleted rules. */
  rule: PriceAnalyticsRuleInfo | null;
  /** The rule name or the layer title of a deleted rule; null for CLIENT_DISCOUNT and CUSTOM_*. */
  name: string | null;
  bookingsCount: number;
  salesCount: number;
  clientsCount: number;
  itemsCount: number;
  amount: Prisma.Decimal;
  /** Share of the group, 0-100, one decimal. */
  sharePct: number;
}
