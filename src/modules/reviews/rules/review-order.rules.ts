import { Prisma } from '@prisma/client';
import { stableOrderBy } from '../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { ReviewSearchOrderBy } from '../enums/review-search-order-by.enum.js';

/** Newest first by default; equal ratings fall back to the newest review. */
export function reviewOrderBy(
  orderBy: ReviewSearchOrderBy | undefined,
  direction: OrderDirection = OrderDirection.DESC,
): Prisma.ReviewOrderByWithRelationInput[] {
  return orderBy === ReviewSearchOrderBy.RATING
    ? stableOrderBy(
        [{ rating: direction }, { reviewedAt: OrderDirection.DESC }],
        direction,
      )
    : stableOrderBy({ reviewedAt: direction }, direction);
}
