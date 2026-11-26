import { Prisma, PriceChangeTarget } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PricedLocationProduct } from '../../products/interfaces/priced-location-product.interface.js';
import { ProductPriceChangeSpecDto } from '../dto/product-price-change-spec.dto.js';
import { PriceTimeline, productKey } from '../engine/price-timeline.js';
import { ProductPriceChangeCounts } from '../interfaces/product-price-change-counts.interface.js';
import { ProductPriceChangeRow } from '../interfaces/product-price-change-row.interface.js';
import { ProductPriceChangeSpec } from '../interfaces/product-price-change-spec.interface.js';
import { priceChangeAfter } from './service-price-change-rows.rules.js';
import {
  parsePriceChangeValue,
  priceChangeInvalid,
} from './service-price-change-spec.rules.js';

/** Key of a product row in a preview and in a create request. */
export const productRowKey = (productId: string): string =>
  `PRODUCT:${productId}`;

/**
 * Parses and bounds a product rule. 400 PRICE_CHANGE_INVALID { field } for an empty scope
 * (`scope`) or a value that does not fit the mode (`value`).
 */
export function parseProductPriceChangeSpec(
  dto: ProductPriceChangeSpecDto,
): ProductPriceChangeSpec {
  if (
    !dto.allProducts &&
    dto.productIds.length === 0 &&
    dto.categoryIds.length === 0
  )
    throw priceChangeInvalid('scope');
  return {
    allProducts: dto.allProducts,
    productIds: [...new Set(dto.productIds)],
    categoryIds: [...new Set(dto.categoryIds)],
    mode: dto.mode,
    value: parsePriceChangeValue(dto.mode, dto.value),
    step: MoneyUtils.toMinor(dto.priceRoundingStep),
    effectiveDate: dto.effectiveDate,
  };
}

/** The products of the scope a rule applies to, in the given order. */
export function selectProductScope(
  products: readonly PricedLocationProduct[],
  spec: Pick<ProductPriceChangeSpec, 'allProducts' | 'productIds' | 'categoryIds'>,
): PricedLocationProduct[] {
  const ids = new Set(spec.productIds);
  const categories = new Set(spec.categoryIds);
  return products.filter(
    (product) =>
      spec.allProducts ||
      ids.has(product.productId) ||
      (product.categoryId !== null && categories.has(product.categoryId)),
  );
}

/** The retail price of a product in force on the date: stored value moved by scheduled changes. */
export function productPriceOn(
  product: PricedLocationProduct,
  date: string,
  timeline: PriceTimeline,
): number {
  const current = MoneyUtils.toMinor(product.retailPrice);
  return (
    timeline.resolve(productKey(product.productLocationId), date, current) ??
    current
  );
}

/**
 * One preview row. `belowCost` compares "after" with the last purchase unit cost and is
 * computed always; the cost itself is shown only with `canReadCost`.
 */
export function productChangeRow(
  product: PricedLocationProduct,
  prices: {
    before: number;
    after: number;
    invalid: boolean;
    checked: boolean;
    replacesScheduledDate?: string | null;
  },
  cost: Prisma.Decimal | null,
  canReadCost: boolean,
): ProductPriceChangeRow {
  return {
    replacesScheduledDate: null,
    key: productRowKey(product.productId),
    productId: product.productId,
    productLocationId: product.productLocationId,
    title: product.name,
    sku: product.sku,
    unit: product.unit,
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    status: product.status,
    ...prices,
    lastPurchaseUnitCost: canReadCost ? cost : null,
    belowCost: cost !== null && MoneyUtils.fromMinor(prices.after).lt(cost),
  };
}

/**
 * Preview rows of a rule on a date, in the order of `products` (category order, uncategorized
 * last, then name). "Before" is the price in effect that day, so chained changes compute
 * from each other; "after", `invalid` and `checked` follow the service rules (PERCENT and
 * AMOUNT round to the nearest step, SET is not rounded, 0 from above 0 is invalid).
 */
export function buildProductPriceChangeRows(
  products: readonly PricedLocationProduct[],
  spec: Pick<ProductPriceChangeSpec, 'mode' | 'value' | 'step'>,
  date: string,
  timeline: PriceTimeline,
  costs: ReadonlyMap<string, Prisma.Decimal>,
  canReadCost: boolean,
): ProductPriceChangeRow[] {
  return products.map((product) => {
    const before = productPriceOn(product, date, timeline);
    const { after, invalid } = priceChangeAfter(
      PriceChangeTarget.PRODUCT,
      before,
      spec,
    );
    return productChangeRow(
      product,
      { before, after, invalid, checked: !invalid && after !== before },
      costs.get(product.productLocationId) ?? null,
      canReadCost,
    );
  });
}

export function countProductPriceChangeRows(
  rows: readonly ProductPriceChangeRow[],
): ProductPriceChangeCounts {
  return {
    products: new Set(rows.map((row) => row.productId)).size,
    rows: rows.length,
    changed: rows.filter((row) => row.checked).length,
    invalid: rows.filter((row) => row.invalid).length,
    belowCost: rows.filter((row) => row.belowCost).length,
  };
}
