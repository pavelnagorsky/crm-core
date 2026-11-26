import { Prisma, ProductStatus, ProductUnit } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { PricedLocationProduct } from '../../products/interfaces/priced-location-product.interface.js';
import { PriceChangeTarget } from '../engine/enums/price-change-target.enum.js';
import { PriceTimeline } from '../engine/price-timeline.js';
import { PriceChangeMode } from '../enums/price-change-mode.enum.js';
import { selectChangedRows } from './price-change-select.rules.js';
import {
  buildProductPriceChangeRows,
  countProductPriceChangeRows,
  parseProductPriceChangeSpec,
  selectProductScope,
} from './product-price-change-rows.rules.js';

const priced = (
  productId: string,
  retailPrice: string,
  categoryId: string | null = null,
): PricedLocationProduct => ({
  productLocationId: `pl-${productId}`,
  productId,
  retailPrice: new Prisma.Decimal(retailPrice),
  status: ProductStatus.ACTIVE,
  name: `Товар ${productId}`,
  sku: null,
  barcode: null,
  unit: ProductUnit.PIECE,
  categoryId,
  categoryName: categoryId,
  categorySortOrder: null,
});

const spec = {
  allProducts: true,
  productIds: [],
  categoryIds: [],
  mode: PriceChangeMode.PERCENT,
  value: '10.00',
  priceRoundingStep: '1.00',
  effectiveDate: null,
};

function thrown(fn: () => unknown): AppException {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('did not throw');
}

const NO_TIMELINE = new PriceTimeline([]);
const NO_COSTS = new Map<string, Prisma.Decimal>();

describe('parseProductPriceChangeSpec', () => {
  it('400 PRICE_CHANGE_INVALID { field: scope } for an empty scope', () => {
    const error = thrown(() =>
      parseProductPriceChangeSpec({ ...spec, allProducts: false }),
    );
    expect(error.errorCode).toBe('PRICE_CHANGE_INVALID');
    expect(error.payload).toEqual({ field: 'scope' });
  });

  it('400 { field: value } for a percent out of range', () => {
    const error = thrown(() =>
      parseProductPriceChangeSpec({ ...spec, value: '-100.00' }),
    );
    expect(error.payload).toEqual({ field: 'value' });
  });
});

describe('selectProductScope', () => {
  it('takes the listed products and the products of the listed categories', () => {
    const products = [priced('a', '10'), priced('b', '10', 'c1'), priced('c', '10', 'c2')];
    const scope = selectProductScope(products, {
      allProducts: false,
      productIds: ['a'],
      categoryIds: ['c2'],
    });
    expect(scope.map((p) => p.productId)).toEqual(['a', 'c']);
  });
});

describe('buildProductPriceChangeRows', () => {
  it('PERCENT rounds to the nearest step from the price in force on the date', () => {
    const timeline = new PriceTimeline([
      {
        id: 'ch1',
        effectiveDate: '2026-12-01',
        items: [
          {
            target: PriceChangeTarget.PRODUCT,
            serviceId: null,
            levelId: null,
            staffId: null,
            bundleId: null,
            productLocationId: 'pl-a',
            price: 6000,
          },
        ],
      },
    ]);
    const parsed = parseProductPriceChangeSpec({ ...spec, value: '20.00' });
    const [today] = buildProductPriceChangeRows(
      [priced('a', '55.00')],
      parsed,
      '2026-11-30',
      timeline,
      NO_COSTS,
      true,
    );
    expect(today).toMatchObject({ key: 'PRODUCT:a', before: 5500, after: 6600, checked: true });
    const [later] = buildProductPriceChangeRows(
      [priced('a', '55.00')],
      parsed,
      '2026-12-02',
      timeline,
      NO_COSTS,
      true,
    );
    expect(later).toMatchObject({ before: 6000, after: 7200 });
  });

  it('SET is not rounded; 0 from above 0 is invalid and not checked', () => {
    const rows = buildProductPriceChangeRows(
      [priced('a', '55.00'), priced('b', '0')],
      parseProductPriceChangeSpec({
        ...spec,
        mode: PriceChangeMode.SET,
        value: '0.00',
      }),
      '2026-11-30',
      NO_TIMELINE,
      NO_COSTS,
      true,
    );
    expect(rows[0]).toMatchObject({ after: 0, invalid: true, checked: false });
    expect(rows[1]).toMatchObject({ after: 0, invalid: false, checked: false });
    const set = buildProductPriceChangeRows(
      [priced('a', '55.00')],
      parseProductPriceChangeSpec({
        ...spec,
        mode: PriceChangeMode.SET,
        value: '12.34',
      }),
      '2026-11-30',
      NO_TIMELINE,
      NO_COSTS,
      true,
    );
    expect(set[0]).toMatchObject({ after: 1234, checked: true });
  });

  it('marks a price below the last purchase price; the cost is shown only with the access', () => {
    const costs = new Map([['pl-a', new Prisma.Decimal('60.12345678')]]);
    const parsed = parseProductPriceChangeSpec({
      ...spec,
      mode: PriceChangeMode.AMOUNT,
      value: '1.00',
    });
    const [visible] = buildProductPriceChangeRows(
      [priced('a', '55.00'), priced('b', '70.00')],
      parsed,
      '2026-11-30',
      NO_TIMELINE,
      costs,
      true,
    );
    expect(visible.belowCost).toBe(true);
    expect(visible.lastPurchaseUnitCost?.toString()).toBe('60.12345678');
    const hidden = buildProductPriceChangeRows(
      [priced('a', '55.00'), priced('b', '70.00')],
      parsed,
      '2026-11-30',
      NO_TIMELINE,
      costs,
      false,
    );
    expect(hidden[0]).toMatchObject({ belowCost: true, lastPurchaseUnitCost: null });
    expect(hidden[1].belowCost).toBe(false);
    expect(countProductPriceChangeRows(hidden)).toEqual({
      products: 2,
      rows: 2,
      changed: 2,
      invalid: 0,
      belowCost: 1,
    });
  });
});

describe('selectChangedRows over product rows', () => {
  const rows = buildProductPriceChangeRows(
    [priced('a', '55.00'), priced('b', '0.40')],
    parseProductPriceChangeSpec({
      ...spec,
      mode: PriceChangeMode.PERCENT,
      value: '-99.00',
    }),
    '2026-11-30',
    NO_TIMELINE,
    NO_COSTS,
    true,
  );

  it('takes the selected rows with a manual price', () => {
    const picked = selectChangedRows(
      rows,
      ['PRODUCT:a'],
      [{ key: 'PRODUCT:a', price: 4000 }],
      () => false,
    );
    expect(picked.map(({ row, after }) => [row.productId, after])).toEqual([
      ['a', 4000],
    ]);
  });

  it('409 PRICE_CHANGE_STALE for a key the preview does not have', () => {
    const error = thrown(() =>
      selectChangedRows(rows, ['PRODUCT:gone'], [], () => false),
    );
    expect(error.errorCode).toBe('PRICE_CHANGE_STALE');
    expect(error.payload).toEqual({ keys: ['PRODUCT:gone'] });
  });

  it('400 PRICE_CHANGE_ROW_INVALID for an unedited invalid row and for removing a retail price', () => {
    expect(rows[1].invalid).toBe(true);
    expect(
      thrown(() => selectChangedRows(rows, ['PRODUCT:b'], [], () => false))
        .errorCode,
    ).toBe('PRICE_CHANGE_ROW_INVALID');
    expect(
      thrown(() =>
        selectChangedRows(
          rows,
          ['PRODUCT:a'],
          [{ key: 'PRODUCT:a', price: null }],
          () => false,
        ),
      ).errorCode,
    ).toBe('PRICE_CHANGE_ROW_INVALID');
  });

  it('400 PRICE_CHANGE_EMPTY when every selected row keeps its price', () => {
    expect(
      thrown(() =>
        selectChangedRows(
          rows,
          ['PRODUCT:a'],
          [{ key: 'PRODUCT:a', price: 5500 }],
          () => false,
        ),
      ).errorCode,
    ).toBe('PRICE_CHANGE_EMPTY');
  });
});
