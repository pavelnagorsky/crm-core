import { PriceAdjustmentKind, PriceValueType, Prisma } from '@prisma/client';

/** One price layer of a service line, ready to store. */
export interface ServicePriceAdjustment {
  sortOrder: number;
  kind: PriceAdjustmentKind;
  ruleId: string | null;
  title: string;
  publicTitle: string | null;
  valueType: PriceValueType | null;
  value: Prisma.Decimal | null;
  amount: Prisma.Decimal;
}
