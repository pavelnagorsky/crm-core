import { PriceAdjustmentKind, Prisma } from '@prisma/client';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';

export function orderItemSnapshot(
  item:
    | OrderWithItems['items'][number]
    | Prisma.OrderItemUncheckedCreateWithoutOrderInput,
) {
  return {
    productId: item.catalogItemId,
    title: item.title,
    quantity: decimalValue(item.quantity, 3),
    unitPrice: decimalValue(item.unitPrice, 2),
    customUnitPrice: decimalValue(item.customUnitPrice, 2),
    discountTotal: decimalValue(item.discountTotal ?? 0, 2),
    discountTitle:
      'priceAdjustments' in item && Array.isArray(item.priceAdjustments)
        ? (item.priceAdjustments.find(
            (layer) =>
              layer.kind === PriceAdjustmentKind.PROMOTION ||
              layer.kind === PriceAdjustmentKind.CLIENT_DISCOUNT,
          )?.title ?? null)
        : null,
    lineTotal: decimalValue(item.lineTotal, 2),
    sellerStaffId: item.sellerStaffId ?? null,
    sellerName: item.sellerName ?? null,
  };
}

function decimalValue(value: unknown, decimals: number): string | null {
  if (value == null) return null;
  return new Prisma.Decimal(value as Prisma.Decimal.Value).toFixed(decimals);
}
