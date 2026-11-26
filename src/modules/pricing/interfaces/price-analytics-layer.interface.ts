import { PriceAdjustmentKind, PriceValueType, Prisma } from '@prisma/client';

/** A stored price layer of a booking item or a product line, as the report reads it. */
export interface PriceAnalyticsLayer {
  sortOrder: number;
  kind: PriceAdjustmentKind;
  ruleId: string | null;
  title: string;
  valueType: PriceValueType | null;
  value: Prisma.Decimal | null;
  /** Signed change of the price. */
  amount: Prisma.Decimal;
}
