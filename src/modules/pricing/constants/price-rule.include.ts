import { Prisma } from '@prisma/client';

/** Everything a rule needs: its targets, intervals and holiday dates in a stable order. */
export const PRICE_RULE_INCLUDE = {
  targets: {
    orderBy: [{ targetType: 'asc' as const }, { targetId: 'asc' as const }],
  },
  intervals: { orderBy: { startMinute: 'asc' as const } },
  dates: { orderBy: { date: 'asc' as const } },
} satisfies Prisma.PriceRuleInclude;
