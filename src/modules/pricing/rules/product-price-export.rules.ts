import { Prisma } from '@prisma/client';
import { PricedLocationProduct } from '../../products/interfaces/priced-location-product.interface.js';
import {
  PRODUCT_PRICE_SHEET_HEADERS,
  PRODUCT_PRICE_UNIT_LABELS,
} from '../constants/product-price-import.constants.js';
import { ProductPriceSheetColumn } from '../enums/product-price-sheet-column.enum.js';

const ID_WIDTH = 38;

/** A money value as a Number cell with two decimals of precision. */
const cell = (value: { toFixed(places: number): string }): number =>
  Number(value.toFixed(2));

/**
 * The product price sheet: the products the location sells in the given order (category
 * order, then name). The column of the last purchase price is there only with `withCost`.
 */
export function buildProductPriceSheet(
  products: readonly PricedLocationProduct[],
  costs: ReadonlyMap<string, Prisma.Decimal>,
  withCost: boolean,
): {
  columns: { header: string; key: string; width: number }[];
  rows: Record<string, string | number | null>[];
} {
  const h = PRODUCT_PRICE_SHEET_HEADERS;
  const columns = [
    { header: h[ProductPriceSheetColumn.ID], key: 'id', width: ID_WIDTH },
    { header: h[ProductPriceSheetColumn.CATEGORY], key: 'category', width: 24 },
    { header: h[ProductPriceSheetColumn.TITLE], key: 'title', width: 32 },
    { header: h[ProductPriceSheetColumn.SKU], key: 'sku', width: 16 },
    { header: h[ProductPriceSheetColumn.BARCODE], key: 'barcode', width: 18 },
    { header: h[ProductPriceSheetColumn.UNIT], key: 'unit', width: 10 },
    { header: h[ProductPriceSheetColumn.PRICE], key: 'price', width: 14 },
    ...(withCost
      ? [
          {
            header: h[ProductPriceSheetColumn.LAST_PURCHASE_COST],
            key: 'cost',
            width: 26,
          },
        ]
      : []),
  ];
  const rows = products.map((product) => {
    const cost = costs.get(product.productLocationId);
    return {
      id: product.productId,
      category: product.categoryName ?? '',
      title: product.name,
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      unit: PRODUCT_PRICE_UNIT_LABELS[product.unit],
      price: cell(product.retailPrice),
      ...(withCost ? { cost: cost ? cell(cost) : null } : {}),
    };
  });
  return { columns, rows };
}
