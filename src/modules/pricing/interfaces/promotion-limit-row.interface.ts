import { PromotionLimitPeriod } from '@prisma/client';

/** A live promotion with a usage limit, as the pricing lock reads it. */
export interface PromotionLimitRow {
  id: string;
  usageLimitTotal: number | null;
  usageLimitPerClient: number | null;
  usageLimitPeriod: PromotionLimitPeriod | null;
}
