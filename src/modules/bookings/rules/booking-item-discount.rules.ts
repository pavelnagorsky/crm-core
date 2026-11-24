import {
  BookingItemPriceAdjustment,
  PriceAdjustmentKind,
} from '@prisma/client';

const DISCOUNT_KINDS: ReadonlySet<PriceAdjustmentKind> = new Set([
  PriceAdjustmentKind.PROMOTION,
  PriceAdjustmentKind.CLIENT_DISCOUNT,
]);

/** The discount layer of an item (one at most: discounts never add up), or null. */
export function itemDiscount(
  adjustments: readonly BookingItemPriceAdjustment[] | undefined,
): BookingItemPriceAdjustment | null {
  return (
    adjustments?.find((adjustment) => DISCOUNT_KINDS.has(adjustment.kind)) ??
    null
  );
}
