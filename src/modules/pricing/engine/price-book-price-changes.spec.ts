import { ServicePriceChangeTarget } from './enums/service-price-change-target.enum.js';
import { PricingPriceChangeEntry } from './interfaces/pricing-price-change-entry.interface.js';
import { PriceBook } from './price-book.js';
import {
  PRICING_TODAY,
  fixedBundle,
  priceLevel,
  pricingSnapshot,
  pricingStaff,
  quoteLine,
  sumBundle,
} from './testing/pricing-snapshot.factory.js';

const T = ServicePriceChangeTarget;
const item = (
  target: ServicePriceChangeTarget,
  price: number | null,
  refs: {
    serviceId?: string;
    levelId?: string;
    staffId?: string;
    bundleId?: string;
  },
) => ({
  target,
  price,
  serviceId: refs.serviceId ?? null,
  levelId: refs.levelId ?? null,
  staffId: refs.staffId ?? null,
  bundleId: refs.bundleId ?? null,
});
const change = (
  id: string,
  effectiveDate: string,
  items: PricingPriceChangeEntry['items'],
): PricingPriceChangeEntry => ({ id, effectiveDate, items });

// today = 2026-11-25. Cut 60.00, color 90.00; Senior level cut 80.00; anna has no
// personal price, boris is Senior, clara is Senior with a personal cut price 70.00.
function book(priceChanges: PricingPriceChangeEntry[]): PriceBook {
  return new PriceBook(
    pricingSnapshot({
      services: { cut: 6000, color: 9000 },
      levels: [
        priceLevel('base', 'Базовый', true),
        priceLevel('senior', 'Старший'),
      ],
      levelPrices: { cut: { senior: 8000 } },
      staff: [
        pricingStaff('anna'),
        pricingStaff('boris', 'senior'),
        pricingStaff('clara', 'senior', { cut: 7000 }),
      ],
      bundles: [sumBundle('sum-bundle'), fixedBundle('fixed-bundle', 12000)],
      priceChanges,
    }),
    PRICING_TODAY,
  );
}

function total(
  b: PriceBook,
  serviceId: string,
  staffId: string,
  date: string | null,
) {
  return b.quote({
    bundleId: null,
    visit: date === null ? null : { date, minute: 600 },
    lines: [quoteLine(serviceId, null, staffId)],
  }).total;
}

describe('PriceBook with scheduled price changes', () => {
  const plus10 = change('c1', '2026-12-01', [
    item(T.BASE, 6600, { serviceId: 'cut' }),
    item(T.LEVEL, 8800, { serviceId: 'cut', levelId: 'senior' }),
    item(T.STAFF, 7700, { serviceId: 'cut', staffId: 'clara' }),
  ]);

  it.each([
    ['anna', 'base', '2026-11-30', 6000],
    ['anna', 'base', '2026-12-01', 6600],
    ['boris', 'level', '2026-11-30', 8000],
    ['boris', 'level', '2026-12-01', 8800],
    ['clara', 'personal', '2026-11-30', 7000],
    ['clara', 'personal', '2026-12-01', 7700],
  ])('%s (%s price) on %s costs %i', (staffId, _layer, date, expected) => {
    expect(total(book([plus10]), 'cut', staffId, date)).toBe(expected);
  });

  it('prices a quote without a visit on today', () => {
    expect(total(book([plus10]), 'cut', 'anna', null)).toBe(6000);
    const todayChange = change('c0', PRICING_TODAY, [
      item(T.BASE, 5000, { serviceId: 'cut' }),
    ]);
    expect(book([todayChange]).staffPrice('cut', 'anna')).toBe(5000);
  });

  it('reads the price by the date given, not by today', () => {
    const b = book([plus10]);
    expect(b.staffPrice('cut', 'anna', PRICING_TODAY)).toBe(6000);
    expect(b.staffPrice('cut', 'anna', '2026-12-02')).toBe(6600);
    expect(
      b.candidatePrice('cut', 'anna', null, { date: '2026-12-02', minute: 0 }),
    ).toBe(6600);
  });

  it('chains changes on two dates', () => {
    const b = book([
      change('c1', '2027-01-01', [item(T.BASE, 5500, { serviceId: 'cut' })]),
      change('c2', '2027-01-02', [item(T.BASE, 6100, { serviceId: 'cut' })]),
    ]);
    expect(b.basePriceAt('cut', '2026-12-31')).toBe(6000);
    expect(b.basePriceAt('cut', '2027-01-01')).toBe(5500);
    expect(b.basePriceAt('cut', '2027-01-02')).toBe(6100);
    expect(b.basePriceAt('color', '2027-01-02')).toBe(9000);
  });

  it('a null level price falls back to the base price of that date', () => {
    const b = book([
      change('c1', '2026-12-01', [
        item(T.LEVEL, null, { serviceId: 'cut', levelId: 'senior' }),
        item(T.BASE, 6600, { serviceId: 'cut' }),
      ]),
    ]);
    expect(b.staffPrice('cut', 'boris', '2026-11-30')).toBe(8000);
    expect(b.staffPrice('cut', 'boris', '2026-12-01')).toBe(6600);
  });

  it('a null personal price falls back to the level price', () => {
    const b = book([
      change('c1', '2026-12-01', [
        item(T.STAFF, null, { serviceId: 'cut', staffId: 'clara' }),
      ]),
    ]);
    expect(b.staffPrice('cut', 'clara', '2026-11-30')).toBe(7000);
    expect(b.staffPrice('cut', 'clara', '2026-12-01')).toBe(8000);
  });

  it('explain shows the layers of the visit date', () => {
    const { quote } = book([plus10]).explain({
      bundleId: null,
      visit: { date: '2026-12-01', minute: 600 },
      lines: [quoteLine('cut', null, 'boris')],
    });
    expect(quote.lines[0]).toMatchObject({ basePrice: 6600, staffPrice: 8800 });
    expect(quote.lines[0].adjustments[0].amount).toBe(2200);
  });

  describe('fixed bundle', () => {
    const fixed = change('b1', '2026-12-01', [
      item(T.BUNDLE, 15000, { bundleId: 'fixed-bundle' }),
    ]);
    const quoteBundle = (b: PriceBook, date: string) =>
      b.quote({
        bundleId: 'fixed-bundle',
        visit: { date, minute: 600 },
        lines: [
          quoteLine('cut', null, 'anna'),
          quoteLine('color', null, 'anna'),
        ],
      });

    it('uses the dated package price', () => {
      const b = book([fixed]);
      expect(quoteBundle(b, '2026-11-30').total).toBe(12000);
      expect(quoteBundle(b, '2026-12-01').total).toBe(15000);
      expect(b.fixedPriceAt('fixed-bundle', '2026-12-01')).toBe(15000);
      expect(b.fixedPriceAt('fixed-bundle', '2026-11-30')).toBe(12000);
    });

    it('allocates by the catalog prices of that date', () => {
      const b = book([
        fixed,
        change('c1', '2026-12-01', [item(T.BASE, 12000, { serviceId: 'cut' })]),
      ]);
      // weights 120.00 : 90.00 over 150.00 -> 85.71 / 64.29
      const lines = quoteBundle(b, '2026-12-01').lines;
      expect(lines.map((line) => line.total)).toEqual([8571, 6429]);
    });

    it('ignores a BUNDLE change of a SUM bundle', () => {
      const b = book([
        change('b2', '2026-12-01', [
          item(T.BUNDLE, 1, { bundleId: 'sum-bundle' }),
        ]),
      ]);
      expect(b.fixedPriceAt('sum-bundle', '2026-12-02')).toBeNull();
      const sum = b.quote({
        bundleId: 'sum-bundle',
        visit: { date: '2026-12-02', minute: 600 },
        lines: [
          quoteLine('cut', null, 'anna'),
          quoteLine('color', null, 'anna'),
        ],
      });
      expect(sum.total).toBe(15000);
    });
  });

  describe('priceRange', () => {
    const scope = { bundleId: null, lines: [quoteLine('cut', null, 'anna')] };

    it('shows the range when the window spans the change date', () => {
      const b = book([plus10]);
      expect(
        b.priceRange(scope, ['2026-11-29', '2026-11-30', '2026-12-01']),
      ).toEqual({ min: 6000, max: 6600 });
    });

    it('is flat before or after the change', () => {
      const b = book([plus10]);
      expect(b.priceRange(scope, ['2026-11-28', '2026-11-30'])).toEqual({
        min: 6000,
        max: 6000,
      });
      expect(b.priceRange(scope, ['2026-12-01', '2026-12-05'])).toEqual({
        min: 6600,
        max: 6600,
      });
    });

    it('uses today without dates', () => {
      expect(book([plus10]).priceRange(scope, [])).toEqual({
        min: 6000,
        max: 6000,
      });
    });
  });

  describe('staffPriceKey', () => {
    const dates = ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'];

    it('is one price without changes in the window', () => {
      const b = book([]);
      expect(b.staffPriceKey('cut', 'anna', dates)).toBe('6000');
      expect(b.staffPriceKey('cut', 'boris', dates)).toBe('8000');
      expect(b.staffPriceKey('cut', null, dates)).toBe('6000');
    });

    it('adds the price after each change inside the window', () => {
      const b = book([plus10]);
      expect(b.staffPriceKey('cut', 'anna', dates)).toBe('6000,6600');
      expect(b.staffPriceKey('cut', 'boris', dates)).toBe('8000,8800');
      expect(b.staffPriceKey('cut', 'anna', ['2026-12-01', '2026-12-02'])).toBe(
        '6600',
      );
      expect(b.staffPriceKey('cut', 'anna', ['2026-11-28', '2026-11-30'])).toBe(
        '6000',
      );
    });

    it('groups staff by their prices over the window', () => {
      const b = book([
        change('c1', '2026-12-01', [
          item(T.STAFF, 6600, { serviceId: 'cut', staffId: 'clara' }),
          item(T.BASE, 6600, { serviceId: 'cut' }),
        ]),
      ]);
      expect(b.staffPriceKey('cut', 'anna', dates)).not.toBe(
        b.staffPriceKey('cut', 'clara', dates),
      );
      expect(b.staffPriceKey('cut', 'anna', ['2026-12-01'])).toBe(
        b.staffPriceKey('cut', 'clara', ['2026-12-01']),
      );
    });
  });

  it('daySegments prices the day by its own date', () => {
    const b = book([plus10]);
    const scope = { bundleId: null, lines: [quoteLine('cut', null, 'anna')] };
    expect(b.daySegments(scope, '2026-11-30')[0].quote.total).toBe(6000);
    expect(b.daySegments(scope, '2026-12-01')[0].quote.total).toBe(6600);
  });
});
