import { PriceAdjustmentKind } from './enums/price-adjustment-kind.enum.js';
import { PriceBook } from './price-book.js';
import {
  fixedBundle,
  priceLevel,
  pricingSnapshot,
  pricingStaff,
  quoteLine,
  sumBundle,
  PRICING_TODAY,
} from './testing/pricing-snapshot.factory.js';

/**
 * Catalog: cut 60.00, color 90.00, wash 15.00. Levels: Base (default), Senior, Top.
 * Level prices: cut 80.00 for Senior and 60.00 for Top (equal to base), color 70.00 for
 * Senior, wash none.
 */
const snapshot = pricingSnapshot({
  services: { cut: 6000, color: 9000, wash: 1500 },
  levels: [
    priceLevel('base', 'Базовый', true),
    priceLevel('senior', 'Старший'),
    priceLevel('top', 'Топ'),
  ],
  levelPrices: {
    cut: { senior: 8000, top: 6000 },
    color: { senior: 7000 },
  },
  staff: [
    pricingStaff('anna'),
    pricingStaff('boris', 'senior'),
    pricingStaff('clara', 'top'),
    pricingStaff('dmitri', 'senior', { cut: 7500, color: 9000 }),
    pricingStaff('eva', 'removed-level'),
    pricingStaff('frank', null, { cut: 5000 }),
    pricingStaff('gleb', 'base'),
  ],
  bundles: [
    sumBundle('sum-bundle'),
    fixedBundle('fixed-bundle', 12000),
    fixedBundle('fixed-without-price', null),
  ],
});
const book = new PriceBook(snapshot, PRICING_TODAY);

function adjustmentsOf(serviceId: string, staffId: string | null) {
  const { lines } = book.quote({
    bundleId: null,
    visit: null,
    lines: [quoteLine(serviceId, null, staffId)],
  });
  return lines[0].adjustments;
}

describe('PriceBook', () => {
  describe('staffPrice: personal price, then level price, then base price', () => {
    it.each([
      ['no staff chosen', 'cut', null, 6000],
      ['unknown staff', 'cut', 'nobody', 6000],
      ['default level (null)', 'cut', 'anna', 6000],
      ['default level by id', 'cut', 'gleb', 6000],
      ['level price above base', 'cut', 'boris', 8000],
      ['level price below base', 'color', 'boris', 7000],
      ['service without a level price', 'wash', 'boris', 1500],
      ['level price equal to base', 'cut', 'clara', 6000],
      ['personal price beats level price', 'cut', 'dmitri', 7500],
      ['personal price equal to base beats level', 'color', 'dmitri', 9000],
      ['service without a personal price: level', 'wash', 'dmitri', 1500],
      ['staff level that no longer exists', 'cut', 'eva', 6000],
      ['personal price on the default level', 'cut', 'frank', 5000],
      ['no personal price on another service', 'color', 'frank', 9000],
    ])('%s', (_name, serviceId, staffId, expected) => {
      expect(book.staffPrice(serviceId, staffId)).toBe(expected);
    });

    it('throws for a service outside the snapshot', () => {
      expect(() => book.staffPrice('missing', 'anna')).toThrow(
        'Service missing is not priced',
      );
    });
  });

  describe('quote: adjustments explain the move from the base price', () => {
    it.each([
      ['level price above base', 'cut', 'boris', 'LEVEL', 'Старший', 2000],
      ['level price below base', 'color', 'boris', 'LEVEL', 'Старший', -2000],
      ['personal price above base', 'cut', 'dmitri', 'STAFF', 'dmitri', 1500],
      ['personal price below base', 'cut', 'frank', 'STAFF', 'frank', -1000],
    ] as const)('%s', (_name, serviceId, staffId, kind, title, amount) => {
      expect(adjustmentsOf(serviceId, staffId)).toEqual([
        {
          kind: PriceAdjustmentKind[kind],
          ruleId: null,
          title,
          publicTitle: null,
          valueType: null,
          value: null,
          amount,
        },
      ]);
    });

    it.each([
      ['no staff', 'cut', null],
      ['unknown staff', 'cut', 'nobody'],
      ['default level', 'cut', 'anna'],
      ['level price equal to base', 'cut', 'clara'],
      ['personal price equal to base', 'color', 'dmitri'],
      ['no level price for the service', 'wash', 'boris'],
      ['unknown level', 'cut', 'eva'],
    ])('equal price gives no adjustment: %s', (_name, serviceId, staffId) => {
      expect(adjustmentsOf(serviceId, staffId)).toEqual([]);
    });

    it('fills every layer of a line from the staff price', () => {
      const { lines } = book.quote({
        bundleId: null,
        visit: null,
        lines: [quoteLine('cut', null, 'boris')],
      });
      expect(lines[0]).toMatchObject({
        basePrice: 6000,
        staffPrice: 8000,
        listPrice: 8000,
        discountTotal: 0,
        chargedPrice: 8000,
        customPrice: null,
        total: 8000,
      });
    });

    it('a custom price sets the total and keeps the staff layer as history', () => {
      const quote = book.quote({
        bundleId: null,
        visit: null,
        lines: [
          quoteLine('cut', 5000, 'boris'),
          quoteLine('color', null, 'boris'),
        ],
      });
      expect(quote.lines[0]).toMatchObject({
        staffPrice: 8000,
        chargedPrice: 8000,
        customPrice: 5000,
        total: 5000,
      });
      expect(quote.lines[0].adjustments).toHaveLength(1);
      expect(quote).toMatchObject({ listTotal: 15000, total: 12000 });
    });
  });

  describe('bundles', () => {
    it('a SUM bundle sums the prices of the staff members of its lines', () => {
      const quote = book.quote({
        bundleId: 'sum-bundle',
        visit: null,
        lines: [
          quoteLine('cut', null, 'boris'),
          quoteLine('color', null, 'dmitri'),
        ],
      });
      expect(quote.lines.map((line) => line.basePrice)).toEqual([6000, 9000]);
      expect(quote.lines.map((line) => line.staffPrice)).toEqual([8000, 9000]);
      expect(quote.lines.map((line) => line.adjustments.length)).toEqual([
        1, 0,
      ]);
      expect(quote.total).toBe(17000);
    });

    it.each(['boris', 'dmitri', 'frank', 'eva', 'nobody', null])(
      'a FIXED bundle costs the same with staff %s',
      (staffId) => {
        const quote = book.quote({
          bundleId: 'fixed-bundle',
          visit: null,
          lines: [
            quoteLine('cut', null, staffId),
            quoteLine('color', null, staffId),
          ],
        });
        expect(quote.lines.map((line) => line.basePrice)).toEqual([4800, 7200]);
        expect(quote.lines.map((line) => line.staffPrice)).toEqual([
          4800, 7200,
        ]);
        expect(quote.lines.flatMap((line) => line.adjustments)).toEqual([]);
        expect(quote.total).toBe(12000);
      },
    );

    it('throws for a FIXED bundle without a price', () => {
      expect(() =>
        book.quote({
          bundleId: 'fixed-without-price',
          visit: null,
          lines: [quoteLine('cut')],
        }),
      ).toThrow('Fixed bundle fixed-without-price has no price');
    });

    it('throws for a bundle outside the snapshot', () => {
      expect(() =>
        book.quote({ bundleId: 'missing', lines: [quoteLine('cut')], visit: null }),
      ).toThrow('Bundle missing is not priced');
    });
  });

  describe('candidatePrice: what ranking compares', () => {
    it.each([
      ['separate service, level price', 'cut', 'boris', null, 8000],
      ['separate service, personal price', 'cut', 'dmitri', null, 7500],
      ['separate service, base price', 'cut', 'anna', null, 6000],
      ['SUM bundle uses staff prices', 'cut', 'boris', 'sum-bundle', 8000],
      ['SUM bundle, personal price', 'cut', 'frank', 'sum-bundle', 5000],
      ['FIXED bundle: 0 for a level staff', 'cut', 'boris', 'fixed-bundle', 0],
      ['FIXED bundle: 0 for a base staff', 'cut', 'anna', 'fixed-bundle', 0],
      ['unknown bundle is not FIXED', 'cut', 'boris', 'missing', 8000],
    ])('%s', (_name, serviceId, staffId, bundleId, expected) => {
      expect(book.candidatePrice(serviceId, staffId, bundleId)).toBe(expected);
    });
  });

  it('knows its services and bundles', () => {
    expect(book.hasService('cut')).toBe(true);
    expect(book.hasService('missing')).toBe(false);
    expect(book.bundle('sum-bundle')?.serviceIds).toEqual(['cut', 'color']);
    expect(book.bundle('missing')).toBeUndefined();
  });
});
