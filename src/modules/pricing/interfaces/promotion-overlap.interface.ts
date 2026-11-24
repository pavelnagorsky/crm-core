import { PriceValueType, Prisma } from '@prisma/client';

/** An enabled promotion that can meet the draft on the same service, channel, staff and time. */
export interface PromotionOverlap {
  ruleId: string;
  name: string;
  publicName: string | null;
  valueType: PriceValueType;
  value: Prisma.Decimal;
  /** Where they meet first: "Маникюр, пн 10:00". */
  example: string;
}
