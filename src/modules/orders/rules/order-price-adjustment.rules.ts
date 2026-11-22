import { PriceAdjustmentKind, Prisma } from '@prisma/client';
import { OrderPriceAdjustmentData } from '../interfaces/order-price-adjustment-data.interface.js';

/** Layers that lower the price list price; a custom price replaces them. */
const DISCOUNT_KINDS: ReadonlySet<PriceAdjustmentKind> = new Set([
  PriceAdjustmentKind.PROMOTION,
  PriceAdjustmentKind.CLIENT_DISCOUNT,
]);

/**
 * Layers of an order line from its booking item. With a custom price the discount did not
 * apply, so only the layers up to the price list price stay (docs/orders.md).
 */
export function orderLineAdjustments(
  layers: readonly Omit<OrderPriceAdjustmentData, 'sortOrder'>[],
  customPrice: Prisma.Decimal | null,
): OrderPriceAdjustmentData[] {
  return layers
    .filter((layer) => customPrice === null || !DISCOUNT_KINDS.has(layer.kind))
    .map((layer, sortOrder) => ({
      sortOrder,
      kind: layer.kind,
      ruleId: layer.ruleId,
      title: layer.title,
      publicTitle: layer.publicTitle,
      valueType: layer.valueType,
      value: layer.value,
      amount: layer.amount,
    }));
}

/** Same layers in the same order. */
export function sameAdjustments(
  stored: readonly OrderPriceAdjustmentData[],
  expected: readonly OrderPriceAdjustmentData[],
): boolean {
  return (
    stored.length === expected.length &&
    stored.every((layer, index) => {
      const other = expected[index];
      return (
        layer.sortOrder === other.sortOrder &&
        layer.kind === other.kind &&
        layer.ruleId === other.ruleId &&
        layer.title === other.title &&
        layer.publicTitle === other.publicTitle &&
        layer.valueType === other.valueType &&
        (layer.value === null || other.value === null
          ? layer.value === other.value
          : layer.value.equals(other.value)) &&
        layer.amount.equals(other.amount)
      );
    })
  );
}
