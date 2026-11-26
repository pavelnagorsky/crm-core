import { PriceAdjustmentKind, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import {
  PRICE_ANALYTICS_CUSTOM_PRICE_NAME,
  PRICE_ANALYTICS_DISCOUNT_REASONS,
} from '../constants/price-analytics.constants.js';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';
import { PriceAnalyticsBreakdown } from '../interfaces/price-analytics-breakdown.interface.js';
import { PriceAnalyticsChange } from '../interfaces/price-analytics-change.interface.js';
import { PriceAnalyticsLayer } from '../interfaces/price-analytics-layer.interface.js';
import { PriceAnalyticsPrices } from '../interfaces/price-analytics-prices.interface.js';

const ZERO = new Prisma.Decimal(0);

/** Layers of a rule; a ROUNDING layer joins the rule layer right before it. */
const RULE_LAYERS: ReadonlySet<PriceAdjustmentKind> = new Set([
  PriceAdjustmentKind.SURCHARGE,
  PriceAdjustmentKind.PROMOTION,
  PriceAdjustmentKind.CLIENT_DISCOUNT,
]);

const DISCOUNT_LAYERS: ReadonlySet<PriceAdjustmentKind> = new Set([
  PriceAdjustmentKind.PROMOTION,
  PriceAdjustmentKind.CLIENT_DISCOUNT,
]);

/**
 * Splits one item into regular + surcharges - discounts = received with the reasons
 * (docs/pricing-stage8-api.md, «Как считается одна позиция»):
 * - each rule layer takes the ROUNDING layers right after it (by sortOrder); a rounding after
 *   a level or staff layer, or before any layer, belongs to the regular price;
 * - surcharges: the SURCHARGE layers with a positive amount;
 * - without a custom price the one discount layer takes the whole discount of the item
 *   (list - received), its rounding included; several discount layers (legacy) are kept only
 *   when they add up to it exactly;
 * - a custom price replaces the automatic discount (its layers are ignored): received - list
 *   is CUSTOM_PRICE_DOWN or CUSTOM_PRICE_UP;
 * - the regular price is what is left: received - surcharges + discounts. When the layers do
 *   not match the prices (items priced before stage 1), the difference lands there and not
 *   in a reason; a layout that would make it negative keeps no rule reason at all.
 */
export function priceItemBreakdown(
  prices: PriceAnalyticsPrices,
): PriceAnalyticsBreakdown {
  const groups = ruleGroups(prices.layers);
  let surchargeChanges = groups
    .filter(
      (group) =>
        group.kind === PriceAdjustmentKind.SURCHARGE && group.amount.gt(0),
    )
    .map((group) => ruleChange(PriceChangeReason.SURCHARGE, group, group.amount));
  if (sum(surchargeChanges).gt(prices.list)) surchargeChanges = [];

  const delta = prices.received.minus(prices.list);
  let customChanges: PriceAnalyticsChange[] = [];
  let discountChanges: PriceAnalyticsChange[] = [];
  if (prices.custom) {
    if (!delta.isZero())
      customChanges = [
        customChange(
          delta.lt(0)
            ? PriceChangeReason.CUSTOM_PRICE_DOWN
            : PriceChangeReason.CUSTOM_PRICE_UP,
          delta.abs(),
        ),
      ];
  } else if (delta.lt(0)) {
    discountChanges = discountReasons(groups, delta.negated());
  }

  if (
    prices.received
      .minus(sum(surchargeChanges))
      .plus(sum(discountChanges))
      .lt(0)
  )
    surchargeChanges = [];
  return breakdownOf(prices.received, [
    ...surchargeChanges,
    ...customChanges.filter((change) => !isDiscount(change)),
    ...discountChanges,
    ...customChanges.filter(isDiscount),
  ]);
}

/**
 * What a product line keeps after its posted returns: every amount and change shrinks by the
 * returned share of the quantity, cumulatively as the returns allocate it
 * (MoneyUtils.allocateCumulative for the line total and surcharges,
 * allocateCumulativeDown for discounts, as allocateReturn does); the regular price is what is
 * left, so the invariant holds. null when the whole quantity was returned.
 */
export function afterReturns(
  breakdown: PriceAnalyticsBreakdown,
  quantity: Prisma.Decimal,
  returnedQuantity: Prisma.Decimal,
): PriceAnalyticsBreakdown | null {
  if (returnedQuantity.lte(0)) return breakdown;
  if (returnedQuantity.gte(quantity)) return null;
  const kept = (amount: Prisma.Decimal, down: boolean): Prisma.Decimal =>
    amount.minus(
      down
        ? MoneyUtils.allocateCumulativeDown(
            amount,
            quantity,
            returnedQuantity,
            ZERO,
            ZERO,
          )
        : MoneyUtils.allocateCumulative(
            amount,
            quantity,
            returnedQuantity,
            ZERO,
            ZERO,
          ),
    );
  const received = kept(breakdown.received, false);
  const changes = breakdown.changes
    .map((change) => ({
      ...change,
      amount: kept(change.amount, isDiscount(change)),
    }))
    .filter((change) => change.amount.gt(0));
  return breakdownOf(received, changes);
}

function breakdownOf(
  received: Prisma.Decimal,
  changes: PriceAnalyticsChange[],
): PriceAnalyticsBreakdown {
  const surcharges = sum(changes.filter((change) => !isDiscount(change)));
  const discounts = sum(changes.filter(isDiscount));
  return {
    regular: received.minus(surcharges).plus(discounts),
    surcharges,
    discounts,
    received,
    changes,
  };
}

/** The whole discount on the one discount layer, or on several that add up to it exactly. */
function discountReasons(
  groups: readonly PriceAnalyticsLayer[],
  discount: Prisma.Decimal,
): PriceAnalyticsChange[] {
  const layers = groups.filter((group) => DISCOUNT_LAYERS.has(group.kind));
  if (layers.length === 1) return [discountChange(layers[0], discount)];
  if (
    layers.length > 1 &&
    layers.every((layer) => layer.amount.lt(0)) &&
    layers
      .reduce((total, layer) => total.minus(layer.amount), ZERO)
      .equals(discount)
  )
    return layers.map((layer) => discountChange(layer, layer.amount.negated()));
  return [];
}

/** Rule layers by sortOrder with the rounding that follows each one added to it. */
function ruleGroups(
  layers: readonly PriceAnalyticsLayer[],
): PriceAnalyticsLayer[] {
  const groups: PriceAnalyticsLayer[] = [];
  let last: PriceAnalyticsLayer | null = null;
  for (const layer of [...layers].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (layer.kind === PriceAdjustmentKind.ROUNDING) {
      if (last) last.amount = last.amount.plus(layer.amount);
    } else if (RULE_LAYERS.has(layer.kind)) {
      last = { ...layer };
      groups.push(last);
    } else {
      last = null;
    }
  }
  return groups;
}

function discountChange(
  layer: PriceAnalyticsLayer,
  amount: Prisma.Decimal,
): PriceAnalyticsChange {
  return layer.kind === PriceAdjustmentKind.CLIENT_DISCOUNT
    ? { ...ruleChange(PriceChangeReason.CLIENT_DISCOUNT, layer, amount), ruleId: null }
    : ruleChange(PriceChangeReason.PROMOTION, layer, amount);
}

function ruleChange(
  reason: PriceChangeReason,
  layer: PriceAnalyticsLayer,
  amount: Prisma.Decimal,
): PriceAnalyticsChange {
  return {
    reason,
    ruleId: layer.ruleId,
    name: layer.title,
    valueType: layer.valueType,
    value: layer.value,
    amount,
  };
}

function customChange(
  reason: PriceChangeReason,
  amount: Prisma.Decimal,
): PriceAnalyticsChange {
  return {
    reason,
    ruleId: null,
    name: PRICE_ANALYTICS_CUSTOM_PRICE_NAME,
    valueType: null,
    value: null,
    amount,
  };
}

export function isDiscount(change: PriceAnalyticsChange): boolean {
  return PRICE_ANALYTICS_DISCOUNT_REASONS.has(change.reason);
}

function sum(changes: readonly PriceAnalyticsChange[]): Prisma.Decimal {
  return changes.reduce((total, change) => total.plus(change.amount), ZERO);
}
