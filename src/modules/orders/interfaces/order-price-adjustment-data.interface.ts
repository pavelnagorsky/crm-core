import { PriceAdjustmentKind, PriceValueType, Prisma } from '@prisma/client';

/** Price layer an order line carries, as written to OrderItemPriceAdjustment. */
export interface OrderPriceAdjustmentData {
  sortOrder: number;
  kind: PriceAdjustmentKind;
  ruleId: string | null;
  title: string;
  publicTitle: string | null;
  valueType: PriceValueType | null;
  value: Prisma.Decimal | null;
  amount: Prisma.Decimal;
}
