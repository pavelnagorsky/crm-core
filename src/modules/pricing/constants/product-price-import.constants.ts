import { ProductUnit } from '@prisma/client';
import { ProductPriceSheetColumn } from '../enums/product-price-sheet-column.enum.js';

export const PRODUCT_PRICE_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_PRICE_IMPORT_MAX_ROWS = 5000;
export const PRODUCT_PRICE_IMPORT_MAX_LISTED_ERRORS = 200;

export const PRODUCT_PRICE_SHEET_NAME = 'Цены';
export const PRODUCT_PRICE_FILE_PREFIX = 'product-prices';
export const PRODUCT_PRICE_TEMPLATE_FILE = 'product-prices-template.xlsx';

export const PRODUCT_PRICE_SHEET_HEADERS: Record<ProductPriceSheetColumn, string> = {
  [ProductPriceSheetColumn.ID]: 'ID',
  [ProductPriceSheetColumn.CATEGORY]: 'Категория',
  [ProductPriceSheetColumn.TITLE]: 'Название',
  [ProductPriceSheetColumn.SKU]: 'Артикул',
  [ProductPriceSheetColumn.BARCODE]: 'Штрихкод',
  [ProductPriceSheetColumn.UNIT]: 'Единица',
  [ProductPriceSheetColumn.PRICE]: 'Цена',
  [ProductPriceSheetColumn.LAST_PURCHASE_COST]: 'Последняя закупочная цена',
};

/** Header synonyms; compared in normalized form (see `normalizeName`). */
export const PRODUCT_PRICE_SHEET_ALIASES: Record<
  ProductPriceSheetColumn,
  readonly string[]
> = {
  [ProductPriceSheetColumn.ID]: ['id', 'ид'],
  [ProductPriceSheetColumn.CATEGORY]: ['категория', 'category'],
  [ProductPriceSheetColumn.TITLE]: ['название', 'товар', 'name'],
  [ProductPriceSheetColumn.SKU]: ['артикул', 'sku'],
  [ProductPriceSheetColumn.BARCODE]: ['штрихкод', 'barcode'],
  [ProductPriceSheetColumn.UNIT]: ['единица', 'unit'],
  [ProductPriceSheetColumn.PRICE]: ['цена', 'розничная цена', 'price'],
  [ProductPriceSheetColumn.LAST_PURCHASE_COST]: ['последняя закупочная цена'],
};

export const PRODUCT_PRICE_SHEET_REQUIRED: readonly ProductPriceSheetColumn[] = [
  ProductPriceSheetColumn.ID,
  ProductPriceSheetColumn.PRICE,
];

/** Short unit names for the price sheet. */
export const PRODUCT_PRICE_UNIT_LABELS: Record<ProductUnit, string> = {
  [ProductUnit.PIECE]: 'шт',
  [ProductUnit.GRAM]: 'г',
  [ProductUnit.KILOGRAM]: 'кг',
  [ProductUnit.MILLILITER]: 'мл',
  [ProductUnit.LITER]: 'л',
};
