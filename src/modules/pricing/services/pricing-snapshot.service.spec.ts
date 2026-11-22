import { BundlePricingMode as PrismaBundlePricingMode } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { BundlePricingMode } from '../engine/enums/bundle-pricing-mode.enum.js';
import { bookingCatalogSnapshot } from '../testing/booking-catalog-snapshot.factory.js';
import { PricingSnapshotService } from './pricing-snapshot.service.js';

function snapshotService(catalog = bookingCatalogSnapshot()): {
  service: PricingSnapshotService;
  loadCatalogSnapshot: ReturnType<typeof vi.fn>;
} {
  const loadCatalogSnapshot = vi.fn(async () => catalog);
  return {
    service: new PricingSnapshotService({ loadCatalogSnapshot } as never),
    loadCatalogSnapshot,
  };
}

describe('PricingSnapshotService', () => {
  it.each([
    ['60.00', 6000],
    ['0', 0],
    ['0.01', 1],
    ['12.3', 1230],
    ['99999999.99', 9999999999],
  ])('maps service price %s to %i minor units', async (price, minor) => {
    const { service } = snapshotService(
      bookingCatalogSnapshot({ services: { cut: price }, bundles: [] }),
    );
    expect(await service.load('location', ReadConsistency.CACHED)).toEqual({
      services: [{ id: 'cut', price: minor }],
      bundles: [],
    });
  });

  it.each([
    [PrismaBundlePricingMode.SUM, null, BundlePricingMode.SUM, null],
    [PrismaBundlePricingMode.FIXED, '120.00', BundlePricingMode.FIXED, 12000],
    [PrismaBundlePricingMode.FIXED, '99.99', BundlePricingMode.FIXED, 9999],
    [PrismaBundlePricingMode.FIXED, null, BundlePricingMode.FIXED, null],
  ])(
    'maps a %s bundle with fixedPrice %s to %s / %s',
    async (pricingMode, fixedPrice, engineMode, minor) => {
      const { service } = snapshotService(
        bookingCatalogSnapshot({
          bundles: [
            { id: 'bundle', pricingMode, fixedPrice, serviceIds: ['cut'] },
          ],
        }),
      );
      const snapshot = await service.load('location', ReadConsistency.CACHED);
      expect(snapshot.bundles).toEqual([
        {
          id: 'bundle',
          pricingMode: engineMode,
          fixedPrice: minor,
          serviceIds: ['cut'],
        },
      ]);
    },
  );

  it('keeps every catalog service, including those only reachable through bundles', async () => {
    const { service } = snapshotService();
    const snapshot = await service.load('location', ReadConsistency.CACHED);
    expect(snapshot.services).toEqual([
      { id: 'cut', price: 6000 },
      { id: 'color', price: 9000 },
    ]);
    expect(snapshot.bundles.map(({ id }) => id)).toEqual([
      'sum-bundle',
      'fixed-bundle',
    ]);
  });

  it('rejects a catalog price beyond currency scale instead of rounding it', async () => {
    const { service } = snapshotService(
      bookingCatalogSnapshot({ services: { cut: '1.005' }, bundles: [] }),
    );
    await expect(
      service.load('location', ReadConsistency.CACHED),
    ).rejects.toThrow(RangeError);
  });

  it.each([ReadConsistency.CACHED, ReadConsistency.FRESH])(
    'forwards %s to the catalog loader',
    async (consistency) => {
      const { service, loadCatalogSnapshot } = snapshotService();
      await service.load('location', consistency);
      expect(loadCatalogSnapshot).toHaveBeenCalledExactlyOnceWith(
        'location',
        consistency,
      );
    },
  );
});
