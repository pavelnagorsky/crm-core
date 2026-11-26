import { Prisma, ProductStatus, ProductUnit } from '@prisma/client';
import { LocationProductRef } from '../../products/interfaces/location-product-ref.interface.js';
import { PricedLocationProduct } from '../../products/interfaces/priced-location-product.interface.js';
import { PriceTimeline } from '../engine/price-timeline.js';
import { ProductPriceImportRowError } from '../enums/product-price-import-row-error.enum.js';
import { ProductPriceSheet } from '../interfaces/product-price-sheet.interface.js';
import { buildProductPriceSheet } from './product-price-export.rules.js';
import {
  buildProductImportRows,
  planProductPriceImport,
} from './product-price-import.rules.js';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

const priced = (productId: string, retailPrice: string): PricedLocationProduct => ({
  productLocationId: `pl-${productId}`,
  productId,
  retailPrice: new Prisma.Decimal(retailPrice),
  status: ProductStatus.ACTIVE,
  name: 'Маска',
  sku: 'M-1',
  barcode: null,
  unit: ProductUnit.MILLILITER,
  categoryId: null,
  categoryName: null,
  categorySortOrder: null,
});

const ref = (
  productId: string,
  retailPrice: string | null,
  isForSale = true,
): LocationProductRef => ({
  productLocationId: `pl-${productId}`,
  productId,
  name: 'Маска',
  sku: null,
  categoryName: null,
  retailPrice: retailPrice === null ? null : new Prisma.Decimal(retailPrice),
  isForSale,
});

const sheet = (rows: [string, string][]): ProductPriceSheet => ({
  idHeader: 'ID',
  priceHeader: 'Цена',
  rows: rows.map(([id, price], index) => ({ row: index + 2, id, price })),
  snapshot: null,
});

const refs = new Map<string, LocationProductRef>([
  [ID_A, ref(ID_A, '55.00')],
  [ID_B, ref(ID_B, null)],
  [ID_C, ref(ID_C, '10.00', false)],
]);

describe('planProductPriceImport', () => {
  it('reports every row error code with its column', () => {
    const plan = planProductPriceImport(
      sheet([
        ['', '10'],
        [ID_A, '60,5'],
        [ID_A.toUpperCase(), '61'],
        ['44444444-4444-4444-8444-444444444444', '1'],
        [ID_B, '5'],
        [ID_C, '5'],
      ]),
      refs,
    );
    expect(plan.errors).toEqual([
      { row: 2, column: 'ID', code: ProductPriceImportRowError.ID_REQUIRED },
      { row: 4, column: 'ID', code: ProductPriceImportRowError.DUPLICATE_ID },
      { row: 5, column: 'ID', code: ProductPriceImportRowError.ID_NOT_FOUND },
      { row: 6, column: 'ID', code: ProductPriceImportRowError.NOT_FOR_SALE },
      { row: 7, column: 'ID', code: ProductPriceImportRowError.NOT_FOR_SALE },
    ]);
    expect([...plan.prices]).toEqual([[ID_A, 6050]]);
  });

  it('PRICE_INVALID for text, a negative price or more than two decimals; empty changes nothing', () => {
    for (const price of ['abc', '-1', '1.234'])
      expect(
        planProductPriceImport(sheet([[ID_A, price]]), refs).errors,
      ).toEqual([
        { row: 2, column: 'Цена', code: ProductPriceImportRowError.PRICE_INVALID },
      ]);
    const empty = planProductPriceImport(sheet([[ID_A, '']]), refs);
    expect(empty.errors).toEqual([]);
    expect(empty.prices.size).toBe(0);
  });
});

describe('export -> import', () => {
  it('a file exported and uploaded without edits changes no price', () => {
    const products = [priced(ID_A, '55.00'), priced(ID_B, '12.30')];
    const exported = buildProductPriceSheet(products, new Map(), false);
    const uploaded = sheet(
      exported.rows.map((row) => [String(row.id), String(row.price)]),
    );
    const plan = planProductPriceImport(
      uploaded,
      new Map([
        [ID_A, ref(ID_A, '55.00')],
        [ID_B, ref(ID_B, '12.30')],
      ]),
    );
    expect(plan.errors).toEqual([]);
    expect(plan.prices.size).toBe(2);
    expect(
      buildProductImportRows(
        plan.prices,
        products,
        '2026-11-30',
        new PriceTimeline([]),
        new Map(),
        true,
      ),
    ).toEqual([]);
  });

  it('a changed price gives a checked row from the price in force', () => {
    const products = [priced(ID_A, '55.00')];
    const rows = buildProductImportRows(
      new Map([[ID_A, 6000]]),
      products,
      '2026-11-30',
      new PriceTimeline([]),
      new Map(),
      true,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: `PRODUCT:${ID_A}`,
      before: 5500,
      after: 6000,
      invalid: false,
      checked: true,
    });
  });

  it('the export has the purchase price column only with the access', () => {
    const products = [priced(ID_A, '55.00')];
    const costs = new Map([['pl-' + ID_A, new Prisma.Decimal('20.5')]]);
    const withCost = buildProductPriceSheet(products, costs, true);
    expect(withCost.columns.map((c) => c.header)).toContain('Последняя закупочная цена');
    expect(withCost.rows[0]).toMatchObject({ price: 55, cost: 20.5, unit: 'мл' });
    const without = buildProductPriceSheet(products, costs, false);
    expect(without.columns.map((c) => c.header)).not.toContain(
      'Последняя закупочная цена',
    );
    expect(without.rows[0]).not.toHaveProperty('cost');
  });
});
