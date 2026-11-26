import {
  PriceRuleKind,
  PriceValueType,
  Prisma,
  PromotionScenario,
} from '@prisma/client';

/** The current state of a rule a report row names. */
export interface PriceAnalyticsRuleInfo {
  id: string;
  name: string;
  kind: PriceRuleKind;
  scenario: PromotionScenario | null;
  valueType: PriceValueType;
  value: Prisma.Decimal;
  promoCode: string | null;
  archived: boolean;
}
