import { Prisma } from '@prisma/client';
import { LocationProductRef } from '../../products/interfaces/location-product-ref.interface.js';
import { PricedLocationProduct } from '../../products/interfaces/priced-location-product.interface.js';
import { PriceTimeline } from '../engine/price-timeline.js';
import { ProductPriceImportRowError } from '../enums/product-price-import-row-error.enum.js';
import { ProductPriceChangeRow } from '../interfaces/product-price-change-row.interface.js';
import { ProductPriceImportErrorEntry } from '../interfaces/product-price-import-error-entry.interface.js';
import { ProductPriceImportPlan } from '../interfaces/product-price-import-plan.interface.js';
import { ProductPriceSheet } from '../interfaces/product-price-sheet.interface.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { productChangeRow, productPriceOn } from './product-price-change-rows.rules.js';
import { parsePriceCell } from './service-price-import.rules.js';

/**
 * Checks every row of the product price file against the location products (`refs` by
 * Product.id, sold or not). A row needs an ID of a brand product with a row in the location
 * (ID_REQUIRED, ID_NOT_FOUND), once per file (DUPLICATE_ID), sold (NOT_FOR_SALE: not for sale
 * or no retail price); an empty price changes nothing, a bad one is PRICE_INVALID.
 */
export function planProductPriceImport(
  sheet: ProductPriceSheet,
  refs: ReadonlyMap<string, LocationProductRef>,
): ProductPriceImportPlan {
  const errors: ProductPriceImportErrorEntry[] = [];
  const prices = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of sheet.rows) {
    const fail = (column: string | null, code: ProductPriceImportRowError) =>
      errors.push({ row: row.row, column, code });
    const id = row.id.trim();
    if (!id) {
      fail(sheet.idHeader, ProductPriceImportRowError.ID_REQUIRED);
      continue;
    }
    const key = id.toLowerCase();
    if (seen.has(key)) {
      fail(sheet.idHeader, ProductPriceImportRowError.DUPLICATE_ID);
      continue;
    }
    seen.add(key);
    const ref = refs.get(key);
    if (!ref) {
      fail(sheet.idHeader, ProductPriceImportRowError.ID_NOT_FOUND);
      continue;
    }
    if (!ref.isForSale || ref.retailPrice === null) {
      fail(sheet.idHeader, ProductPriceImportRowError.NOT_FOR_SALE);
      continue;
    }
    const price = parsePriceCell(row.price);
    if (price === undefined) {
      fail(sheet.priceHeader, ProductPriceImportRowError.PRICE_INVALID);
      continue;
    }
    if (price !== null) prices.set(ref.productId, MoneyUtils.toMinor(price));
  }
  return { prices, errors };
}

/**
 * The rows a checked file changes, in the order of `products`: "before" is the price in force
 * on the date (stored value moved by scheduled changes), rows whose price stays are left out.
 */
export function buildProductImportRows(
  prices: ReadonlyMap<string, number>,
  products: readonly PricedLocationProduct[],
  date: string,
  timeline: PriceTimeline,
  costs: ReadonlyMap<string, Prisma.Decimal>,
  canReadCost: boolean,
): ProductPriceChangeRow[] {
  return products.flatMap((product) => {
    const after = prices.get(product.productId);
    if (after === undefined) return [];
    const before = productPriceOn(product, date, timeline);
    if (before === after) return [];
    return [
      productChangeRow(
        product,
        { before, after, invalid: false, checked: true },
        costs.get(product.productLocationId) ?? null,
        canReadCost,
      ),
    ];
  });
}
