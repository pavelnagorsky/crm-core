import { Prisma } from '@prisma/client';
import { PRICE_RULE_INCLUDE } from '../constants/price-rule.include.js';

/** A stored rule with its targets, intervals and dates. */
export type PriceRuleRecord = Prisma.PriceRuleGetPayload<{
  include: typeof PRICE_RULE_INCLUDE;
}>;
