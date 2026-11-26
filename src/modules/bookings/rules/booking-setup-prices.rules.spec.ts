import {
  BundlePricingMode as PrismaBundlePricingMode,
  Prisma,
} from '@prisma/client';
import { PriceChangeTarget } from '../../pricing/engine/enums/price-change-target.enum.js';
import { PriceBook } from '../../pricing/engine/price-book.js';
import {
  PRICING_TODAY,
  fixedBundle,
  pricingSnapshot,
  pricingStaff,
} from '../../pricing/engine/testing/pricing-snapshot.factory.js';
import { buildBookingSetupPrices } from './booking-setup-prices.rules.js';

const catalog = {
  services: [{ id: 'cut', price: new Prisma.Decimal('60.00') }],
  bundles: [
    {
      id: 'fixed-bundle',
      pricingMode: PrismaBundlePricingMode.FIXED,
      fixedPrice: new Prisma.Decimal('120.00'),
      items: [{ serviceId: 'cut' }, { serviceId: 'color' }],
    },
  ],
} as never;
const staff = [
  { id: 'anna', staffServices: [{ serviceId: 'cut' }] },
  { id: 'boris', staffServices: [{ serviceId: 'cut' }] },
] as never;

function prices(dates: string[]) {
  const target = {
    serviceId: null,
    levelId: null,
    staffId: null,
    bundleId: null,
    productLocationId: null,
  };
  const book = new PriceBook(
    pricingSnapshot({
      services: { cut: 6000, color: 9000 },
      staff: [pricingStaff('anna'), pricingStaff('boris', null, { cut: 6600 })],
      bundles: [fixedBundle('fixed-bundle', 12000)],
      priceChanges: [
        {
          id: 'c1',
          effectiveDate: '2026-12-01',
          items: [
            {
              ...target,
              target: PriceChangeTarget.BASE,
              serviceId: 'cut',
              price: 6600,
            },
            {
              ...target,
              target: PriceChangeTarget.BUNDLE,
              bundleId: 'fixed-bundle',
              price: 13200,
            },
          ],
        },
      ],
    }),
    PRICING_TODAY,
  );
  return buildBookingSetupPrices(book, catalog, staff, dates);
}

describe('buildBookingSetupPrices with a scheduled change', () => {
  it('shows a range over a window that spans the change date', () => {
    const { services, bundles, staffServicePrices } = prices([
      '2026-11-30',
      '2026-12-01',
    ]);
    expect(services.get('cut')?.priceFrom.toString()).toBe('60');
    expect(services.get('cut')?.priceTo.toString()).toBe('66');
    expect(bundles.get('fixed-bundle')?.priceFrom.toString()).toBe('120');
    expect(bundles.get('fixed-bundle')?.priceTo.toString()).toBe('132');
    // boris has a personal price 66.00 the whole window: his range is flat
    const boris = staffServicePrices.get('boris')?.[0];
    expect(boris?.priceFrom.toString()).toBe('66');
    expect(boris?.priceTo.toString()).toBe('66');
  });

  it('lists the catalog price of today, not of the change date', () => {
    const { services, bundles } = prices(['2026-11-30', '2026-12-01']);
    expect(services.get('cut')?.listPrice?.toString()).toBe('60');
    expect(bundles.get('fixed-bundle')?.listPrice?.toString()).toBe('120');
  });

  it('is flat after the change date', () => {
    const { services } = prices(['2026-12-02', '2026-12-03']);
    expect(services.get('cut')?.priceFrom.toString()).toBe('66');
    expect(services.get('cut')?.priceTo.toString()).toBe('66');
  });
});
