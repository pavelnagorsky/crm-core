import {
  BundlePricingMode as PrismaBundlePricingMode,
  Prisma,
} from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { BundlePricingMode } from '../engine/enums/bundle-pricing-mode.enum.js';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';
import { bookingCatalogSnapshot } from '../testing/booking-catalog-snapshot.factory.js';
import {
  priceLevelRow,
  pricingSnapshotService,
  staffPricingProfile,
} from '../testing/pricing-snapshot-service.factory.js';

const dec = (value: string) => new Prisma.Decimal(value);

describe('PricingSnapshotService', () => {
  describe('catalog', () => {
    it.each([
      ['60.00', 6000],
      ['0', 0],
      ['0.01', 1],
      ['12.3', 1230],
      ['99999999.99', 9999999999],
    ])('maps service price %s to %i minor units', async (price, minor) => {
      const { service } = pricingSnapshotService({
        catalog: bookingCatalogSnapshot({
          services: { cut: price },
          bundles: [],
        }),
      });
      expect(await service.load('location', ReadConsistency.FRESH)).toEqual({
        services: [{ id: 'cut', price: minor, levelPrices: {} }],
        bundles: [],
        levels: [],
        staff: [],
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
        const { service } = pricingSnapshotService({
          catalog: bookingCatalogSnapshot({
            bundles: [
              { id: 'bundle', pricingMode, fixedPrice, serviceIds: ['cut'] },
            ],
          }),
        });
        const snapshot = await service.load('location', ReadConsistency.FRESH);
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
      const { service } = pricingSnapshotService();
      const snapshot = await service.load('location', ReadConsistency.FRESH);
      expect(snapshot.services.map(({ id, price }) => [id, price])).toEqual([
        ['cut', 6000],
        ['color', 9000],
      ]);
      expect(snapshot.bundles.map(({ id }) => id)).toEqual([
        'sum-bundle',
        'fixed-bundle',
      ]);
    });

    it('rejects a catalog price beyond currency scale instead of rounding it', async () => {
      const { service } = pricingSnapshotService({
        catalog: bookingCatalogSnapshot({
          services: { cut: '1.005' },
          bundles: [],
        }),
      });
      await expect(
        service.load('location', ReadConsistency.FRESH),
      ).rejects.toThrow(RangeError);
    });
  });

  describe('levels, level prices and staff', () => {
    const sources = () =>
      pricingSnapshotService({
        levels: [
          priceLevelRow('base', 'Базовый', true),
          priceLevelRow('senior', 'Старший', false, 1),
          priceLevelRow('top', 'Топ', false, 2),
        ],
        levelPrices: [
          { serviceId: 'cut', priceLevelId: 'senior', price: dec('80.00') },
          { serviceId: 'cut', priceLevelId: 'top', price: dec('99.9') },
          { serviceId: 'color', priceLevelId: 'senior', price: dec('0') },
          { serviceId: 'removed', priceLevelId: 'senior', price: dec('1') },
        ],
        staff: [
          staffPricingProfile('anna'),
          staffPricingProfile('boris', 'senior', {
            cut: '75.5',
            color: '0.01',
          }),
        ],
      });

    it('lists the levels in the order the database returned them', async () => {
      const { service } = sources();
      const { levels } = await service.load('location', ReadConsistency.FRESH);
      expect(levels).toEqual([
        { id: 'base', name: 'Базовый', isDefault: true },
        { id: 'senior', name: 'Старший', isDefault: false },
        { id: 'top', name: 'Топ', isDefault: false },
      ]);
    });

    it('puts level prices on their services in minor units and ignores unknown services', async () => {
      const { service } = sources();
      const { services } = await service.load(
        'location',
        ReadConsistency.FRESH,
      );
      expect(services).toEqual([
        { id: 'cut', price: 6000, levelPrices: { senior: 8000, top: 9990 } },
        { id: 'color', price: 9000, levelPrices: { senior: 0 } },
      ]);
    });

    it('maps staff to their level and personal prices in minor units', async () => {
      const { service } = sources();
      const { staff } = await service.load('location', ReadConsistency.FRESH);
      expect(staff).toEqual([
        { id: 'anna', name: 'anna', levelId: null, servicePrices: {} },
        {
          id: 'boris',
          name: 'boris',
          levelId: 'senior',
          servicePrices: { cut: 7550, color: 1 },
        },
      ]);
    });

    it('reads the sources of the requested location only', async () => {
      const { service, listLevels, listLevelPrices, listPricingProfiles } =
        sources();
      await service.load('other', ReadConsistency.FRESH);
      expect(listLevels).toHaveBeenCalledExactlyOnceWith('other');
      expect(listLevelPrices).toHaveBeenCalledExactlyOnceWith('other');
      expect(listPricingProfiles).toHaveBeenCalledExactlyOnceWith('other');
    });

    it('rejects a level price beyond currency scale', async () => {
      const { service } = pricingSnapshotService({
        levelPrices: [
          { serviceId: 'cut', priceLevelId: 'senior', price: dec('1.005') },
        ],
      });
      await expect(
        service.load('location', ReadConsistency.FRESH),
      ).rejects.toThrow(RangeError);
    });

    it('rejects a personal price beyond currency scale', async () => {
      const { service } = pricingSnapshotService({
        staff: [staffPricingProfile('anna', null, { cut: '1.005' })],
      });
      await expect(
        service.load('location', ReadConsistency.FRESH),
      ).rejects.toThrow(RangeError);
    });
  });

  describe('cache', () => {
    it('serves CACHED loads from one read of the sources', async () => {
      const { service, loadCatalogSnapshot, listLevels, listPricingProfiles } =
        pricingSnapshotService();
      const first = await service.load('location', ReadConsistency.CACHED);
      const second = await service.load('location', ReadConsistency.CACHED);
      expect(second).toEqual(first);
      expect(loadCatalogSnapshot).toHaveBeenCalledTimes(1);
      expect(listLevels).toHaveBeenCalledTimes(1);
      expect(listPricingProfiles).toHaveBeenCalledTimes(1);
    });

    it('FRESH bypasses the cache and reads the sources every time', async () => {
      const {
        service,
        loadCatalogSnapshot,
        listPricingProfiles,
        getBookingSettings,
      } = pricingSnapshotService();
      await service.load('location', ReadConsistency.CACHED);
      await service.load('location', ReadConsistency.FRESH);
      await service.load('location', ReadConsistency.FRESH);
      expect(loadCatalogSnapshot).toHaveBeenCalledTimes(3);
      expect(listPricingProfiles).toHaveBeenCalledTimes(3);
      expect(getBookingSettings).toHaveBeenCalledTimes(1);
    });

    it('FRESH does not fill the cache', async () => {
      const { service, listLevels } = pricingSnapshotService();
      await service.load('location', ReadConsistency.FRESH);
      await service.load('location', ReadConsistency.CACHED);
      expect(listLevels).toHaveBeenCalledTimes(2);
    });

    it('fills the cache from fresh sources: the catalog cache is not used inside it', async () => {
      const { service, loadCatalogSnapshot } = pricingSnapshotService();
      await service.load('location', ReadConsistency.CACHED);
      expect(loadCatalogSnapshot).toHaveBeenCalledExactlyOnceWith(
        'location',
        ReadConsistency.FRESH,
      );
    });

    it('caches each location separately', async () => {
      const { service, listLevels } = pricingSnapshotService();
      await service.load('one', ReadConsistency.CACHED);
      await service.load('two', ReadConsistency.CACHED);
      await service.load('one', ReadConsistency.CACHED);
      expect(listLevels).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['pricing', CacheDependency.pricing('location')],
      ['service catalog', CacheDependency.serviceCatalog('location')],
      ['staff directory', CacheDependency.staffDirectory('location')],
      ['location lifecycle', CacheDependency.locationLifecycle('location')],
      ['brand lifecycle', CacheDependency.brandLifecycle('brand')],
    ])('reloads after the %s changed', async (_name, dependency) => {
      const { service, cache, listLevels } = pricingSnapshotService();
      await service.load('location', ReadConsistency.CACHED);
      await cache.invalidate(dependency);
      await service.load('location', ReadConsistency.CACHED);
      expect(listLevels).toHaveBeenCalledTimes(2);
    });

    it('keeps the entry when another location changed', async () => {
      const { service, cache, listLevels } = pricingSnapshotService();
      await service.load('location', ReadConsistency.CACHED);
      await cache.invalidate(CacheDependency.pricing('other'));
      await service.load('location', ReadConsistency.CACHED);
      expect(listLevels).toHaveBeenCalledTimes(1);
    });

    it('returns a copy: a caller cannot change what the next read sees', async () => {
      const { service } = pricingSnapshotService({
        levels: [priceLevelRow('base', 'Базовый', true)],
      });
      const first = await service.load('location', ReadConsistency.CACHED);
      first.levels[0].name = 'changed';
      first.services.length = 0;
      const second: PricingSnapshot = await service.load(
        'location',
        ReadConsistency.CACHED,
      );
      expect(second.levels[0].name).toBe('Базовый');
      expect(second.services).toHaveLength(2);
    });

    it('reads the sources every time when the cache is off', async () => {
      const { service, listLevels } = pricingSnapshotService({
        cacheEnabled: false,
      });
      await service.load('location', ReadConsistency.CACHED);
      await service.load('location', ReadConsistency.CACHED);
      expect(listLevels).toHaveBeenCalledTimes(2);
    });
  });
});
