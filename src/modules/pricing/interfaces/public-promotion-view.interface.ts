import {
  PriceRuleTargetType,
  PriceValueType,
  Prisma,
  PromotionClientFilter,
} from '@prisma/client';

/** A promotion as clients see it (docs/pricing-stage4-api.md, PublicPromotionDto). */
export interface PublicPromotionView {
  id: string;
  publicName: string;
  publicDescription: string | null;
  valueType: PriceValueType;
  value: Prisma.Decimal;
  clientFilter: PromotionClientFilter;
  /** Works only with its promo code; the code itself is never shown. */
  requiresCode: boolean;
  conditions: string[];
  /** What it applies to, for the labels of services and bundles. */
  appliesToAllServices: boolean;
  targets: { type: PriceRuleTargetType; id: string; excluded: boolean }[];
}
