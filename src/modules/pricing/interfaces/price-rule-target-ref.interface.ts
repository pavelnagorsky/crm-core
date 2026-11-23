import { PriceRuleTargetType } from '@prisma/client';

/** What a rule applies to, or is excluded from. */
export interface PriceRuleTargetRef {
  type: PriceRuleTargetType;
  id: string;
  excluded: boolean;
}
