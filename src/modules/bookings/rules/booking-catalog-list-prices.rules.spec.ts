import {
  BundlePricingMode as PrismaBundlePricingMode,
  Prisma,
} from '@prisma/client';
import { PriceChangeTarget } from '../../pricing/engine/enums/price-change-target.enum.js';
import { PriceBook } from '../../pricing/engine/price-book.js';
import {
  PRICING_TODAY,
  fixedBundle,
  priceLevel,
  pricingSnapshot,
  pricingStaff,
  sumBundle,
} from '../../pricing/engine/testing/pricing-snapshot.factory.js';
import { buildCatalogListPrices } from './booking-setup-prices.rules.js';

const bundle = (
  id: string,
  pricingMode: PrismaBundlePricingMode,
  fixedPrice: string | null,
  serviceIds: string[],
) => ({
  id,
  pricingMode,
  fixedPrice: fixedPrice === null ? null : new Prisma.Decimal(fixedPrice),
  items: serviceIds.map((serviceId) => ({ serviceId })),
});

const catalog = {
  services: [
    { id: 'cut', price: new Prisma.Decimal('50.00') },
    { id: 'color', price: new Prisma.Decimal('90.00') },
    { id: 'wash', price: new Prisma.Decimal('15.00') },
  ],
  bundles: [
    bundle('sum-bundle', PrismaBundlePricingMode.SUM, null, ['cut', 'color']),
    bundle('fixed-bundle', PrismaBundlePricingMode.FIXED, '93.00', [
      'cut',
      'color',
    ]),
  ],
} as never;
// anna: personal cut 52.00; boris: level senior, cut 60.00; color only by anna, wash by nobody.
const staff = [
  { id: 'anna', staffServices: [{ serviceId: 'cut' }, { serviceId: 'color' }] },
  { id: 'boris', staffServices: [{ serviceId: 'cut' }] },
] as never;

function book(): PriceBook {
  const target = {
    serviceId: null,
    levelId: null,
    staffId: null,
    bundleId: null,
    productLocationId: null,
  };
  return new PriceBook(
    pricingSnapshot({
      services: { cut: 5000, color: 9000, wash: 1500 },
      levels: [priceLevel('senior', 'Старший')],
      levelPrices: { cut: { senior: 6000 } },
      staff: [
        pricingStaff('anna', null, { cut: 5200 }),
        pricingStaff('boris', 'senior'),
      ],
      bundles: [
        sumBundle('sum-bundle', ['cut', 'color']),
        fixedBundle('fixed-bundle', 9300, ['cut', 'color']),
      ],
      // A change after today does not reach today's price list.
      priceChanges: [
        {
          id: 'c1',
          effectiveDate: '2026-12-01',
          items: [
            {
              ...target,
              target: PriceChangeTarget.BASE,
              serviceId: 'wash',
              price: 2000,
            },
            {
              ...target,
              target: PriceChangeTarget.BUNDLE,
              bundleId: 'fixed-bundle',
              price: 9900,
            },
          ],
        },
      ],
    }),
    PRICING_TODAY,
  );
}

describe('buildCatalogListPrices', () => {
  const { services, bundles } = buildCatalogListPrices(book(), catalog, staff);

  it('ranges a service over the list prices of its staff: personal, level', () => {
    expect(services.get('cut')).toEqual({ min: 5200, max: 6000 });
  });

  it('gives a staff member without personal or level price the base price', () => {
    expect(services.get('color')).toEqual({ min: 9000, max: 9000 });
  });

  it('gives a service nobody performs its base price of today', () => {
    expect(services.get('wash')).toEqual({ min: 1500, max: 1500 });
  });

  it('gives a FIXED bundle its package price of today', () => {
    expect(bundles.get('fixed-bundle')).toEqual({ min: 9300, max: 9300 });
  });

  it('adds the lowest and the highest list prices of a SUM bundle', () => {
    expect(bundles.get('sum-bundle')).toEqual({ min: 14200, max: 15000 });
  });

  it('reads a later date when asked', () => {
    const later = buildCatalogListPrices(book(), catalog, staff, '2026-12-01');
    expect(later.services.get('wash')).toEqual({ min: 2000, max: 2000 });
    expect(later.bundles.get('fixed-bundle')).toEqual({ min: 9900, max: 9900 });
  });
});
