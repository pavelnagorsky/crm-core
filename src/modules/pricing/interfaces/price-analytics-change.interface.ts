import { PriceValueType, Prisma } from '@prisma/client';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';

/** One reason of an item price change; the amount is positive, the reason gives the sign. */
export interface PriceAnalyticsChange {
  reason: PriceChangeReason;
  ruleId: string | null;
  name: string;
  valueType: PriceValueType | null;
  value: Prisma.Decimal | null;
  amount: Prisma.Decimal;
}
