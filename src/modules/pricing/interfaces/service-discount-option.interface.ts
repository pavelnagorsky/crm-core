import { PriceAdjustmentKind, PriceValueType, Prisma } from '@prisma/client';

/** A discount that applies to a line, in money. */
export interface ServiceDiscountOption {
  kind: PriceAdjustmentKind;
  /** Null for the client discount. */
  ruleId: string | null;
  title: string;
  publicTitle: string | null;
  valueType: PriceValueType;
  /** Percent or amount, by valueType. */
  value: Prisma.Decimal;
  /** Discount, positive. */
  amount: Prisma.Decimal;
  chargedPrice: Prisma.Decimal;
}
