import { PriceScheduleType, PriceValueType, Prisma } from '@prisma/client';

/** A surcharge an exclusive holiday rule replaces on its dates. */
export interface PriceRulePreviewReplaced {
  ruleId: string;
  name: string;
  scheduleType: PriceScheduleType;
  valueType: PriceValueType;
  value: Prisma.Decimal;
}
