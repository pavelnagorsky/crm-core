import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';

/** Id of the synthetic staff member that stands for a price level in a snapshot. */
export const LEVEL_SCOPE_STAFF_ID = 'price-level-scope';

/**
 * A snapshot with one more staff member who has no personal prices and sits on the level, so
 * the price book prices "a service at this level" (week map, rule preview) without a real
 * staff member. The engine stays unaware of it. Null when the level is not in the snapshot.
 */
export function withLevelScope(
  snapshot: PricingSnapshot,
  levelId: string,
): { snapshot: PricingSnapshot; staffId: string } | null {
  const level = snapshot.levels.find((item) => item.id === levelId);
  if (!level) return null;
  return {
    snapshot: {
      ...snapshot,
      staff: [
        ...snapshot.staff,
        {
          id: LEVEL_SCOPE_STAFF_ID,
          name: level.name,
          levelId: level.id,
          servicePrices: {},
        },
      ],
    },
    staffId: LEVEL_SCOPE_STAFF_ID,
  };
}
