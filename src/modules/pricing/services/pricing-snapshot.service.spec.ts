import {
  BundlePricingMode as PrismaBundlePricingMode,
  PriceRuleKind,
  PriceRuleTargetType,
  PriceScheduleType,
  PriceValueType,
  Prisma,
  PromotionChannel,
  PromotionClientFilter,
  PromotionLimitPeriod,
} from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { BundlePricingMode } from '../engine/enums/bundle-pricing-mode.enum.js';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';
import { priceRuleRecord } from '../testing/price-rule-record.factory.js';
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
        services: [
          { id: 'cut', categoryId: null, price: minor, levelPrices: {} },
        ],
        bundles: [],
        products: [],
        levels: [],
        staff: [],
        rules: [],
        roundingStep: 100,
        timezone: 'UTC',
        priceChanges: [],
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
        {
          id: 'cut',
          categoryId: null,
          price: 6000,
          levelPrices: { senior: 8000, top: 9990 },
        },
        {
          id: 'color',
          categoryId: null,
          price: 9000,
          levelPrices: { senior: 0 },
        },
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

  describe('categories, rules and rounding', () => {
    it('carries the category of each service', async () => {
      const catalog = bookingCatalogSnapshot();
      catalog.services[0].categoryId = 'hair';
      const { service } = pricingSnapshotService({ catalog });
      const { services } = await service.load(
        'location',
        ReadConsistency.FRESH,
      );
      expect(services.map(({ id, categoryId }) => [id, categoryId])).toEqual([
        ['cut', 'hair'],
        ['color', null],
      ]);
    });

    it.each([
      ['1.00', 100],
      ['0.01', 1],
      ['0.50', 50],
      ['10.00', 1000],
    ])('maps the rounding step %s to %i minor units', async (step, minor) => {
      const { service } = pricingSnapshotService({ roundingStep: step });
      const snapshot = await service.load('location', ReadConsistency.FRESH);
      expect(snapshot.roundingStep).toBe(minor);
    });

    it('maps a percent rule to basis points with its schedule in engine form', async () => {
      const { service } = pricingSnapshotService({
        rules: [
          priceRuleRecord({
            id: 'evening',
            name: 'Evening',
            value: '20.00',
            weekdaysMask: 0b0010100,
            visitFrom: '2026-12-01',
            visitTo: '2026-12-31',
            intervals: [
              [1020, 1260],
              [60, 120],
            ],
            appliesToAllServices: false,
            targets: [
              [PriceRuleTargetType.SERVICE, 'cut'],
              [PriceRuleTargetType.SERVICE_CATEGORY, 'hair'],
            ],
            createdAt: new Date('2026-11-02T08:30:00.000Z'),
          }),
        ],
      });
      const { rules } = await service.load('location', ReadConsistency.FRESH);
      expect(rules).toEqual([
        {
          id: 'evening',
          kind: 'SURCHARGE',
          name: 'Evening',
          scheduleType: 'WEEKLY',
          enabled: true,
          valueType: 'PERCENT',
          value: 2000,
          visitFrom: '2026-12-01',
          visitTo: '2026-12-31',
          yearly: false,
          holidayExclusive: false,
          weekdaysMask: 20,
          intervals: [
            { start: 1020, end: 1260 },
            { start: 60, end: 120 },
          ],
          dates: [],
          appliesToAllServices: false,
          appliesToAllProducts: false,
          targets: [
            { type: 'SERVICE', id: 'cut', excluded: false },
            { type: 'SERVICE_CATEGORY', id: 'hair', excluded: false },
          ],
          promotion: null,
          createdAt: '2026-11-02T08:30:00.000Z',
        },
      ]);
    });

    it('maps a promotion with its conditions, staff and upper-case code', async () => {
      const { service } = pricingSnapshotService({
        rules: [
          priceRuleRecord({
            id: 'promo',
            name: 'Autumn',
            kind: PriceRuleKind.PROMOTION,
            value: '15.00',
            promotion: {
              publicName: 'Осень',
              showAsPromotion: false,
              bookingFrom: new Date('2026-11-01T00:00:00.000Z'),
              bookingTo: new Date('2026-11-30T00:00:00.000Z'),
              minLeadMinutes: 60,
              maxLeadMinutes: 600,
              channels: [PromotionChannel.ONLINE],
              clientFilter: PromotionClientFilter.BIRTHDAY,
              birthdayWindowDays: 7,
              promoCode: 'autumn',
              usageLimitTotal: 100,
              usageLimitPerClient: 1,
              usageLimitPeriod: PromotionLimitPeriod.YEAR,
              minVisitTotal: new Prisma.Decimal('40.50'),
              staffIds: ['anna'],
            },
          }),
        ],
      });
      const { rules } = await service.load('location', ReadConsistency.FRESH);
      expect(rules[0]).toMatchObject({
        id: 'promo',
        kind: 'PROMOTION',
        value: 1500,
        promotion: {
          publicName: 'Осень',
          showAsPromotion: false,
          bookingFrom: '2026-11-01',
          bookingTo: '2026-11-30',
          minLeadMinutes: 60,
          maxLeadMinutes: 600,
          channels: ['ONLINE'],
          staffIds: ['anna'],
          clientFilter: 'BIRTHDAY',
          birthdayWindowDays: 7,
          promoCode: 'AUTUMN',
          usageLimitTotal: 100,
          usageLimitPerClient: 1,
          usageLimitPeriod: 'YEAR',
          minVisitTotal: 4050,
        },
      });
    });

    it('maps an amount rule to minor units and keeps disabled rules', async () => {
      const { service } = pricingSnapshotService({
        rules: [
          priceRuleRecord({
            valueType: PriceValueType.AMOUNT,
            value: '15.50',
            enabled: false,
          }),
        ],
      });
      const { rules } = await service.load('location', ReadConsistency.FRESH);
      expect(rules[0]).toMatchObject({
        valueType: 'AMOUNT',
        value: 1550,
        enabled: false,
      });
    });

    it('maps holiday dates to YYYY-MM-DD strings and the exclusive flag', async () => {
      const { service } = pricingSnapshotService({
        rules: [
          priceRuleRecord({
            scheduleType: PriceScheduleType.HOLIDAYS,
            yearly: true,
            holidayExclusive: true,
            dates: ['2028-02-29', '2026-12-31'],
            appliesToAllServices: false,
            targets: [[PriceRuleTargetType.BUNDLE, 'fixed-bundle']],
          }),
        ],
      });
      const { rules } = await service.load('location', ReadConsistency.FRESH);
      expect(rules[0]).toMatchObject({
        scheduleType: 'HOLIDAYS',
        yearly: true,
        holidayExclusive: true,
        dates: ['2028-02-29', '2026-12-31'],
        targets: [{ type: 'BUNDLE', id: 'fixed-bundle', excluded: false }],
      });
    });

    it('carries the location zone and the scheduled price changes', async () => {
      const priceChanges = [
        { id: 'c1', effectiveDate: '2027-01-01', items: [] },
      ];
      const { service, getLocale, listScheduledChanges } =
        pricingSnapshotService({ timezone: 'Europe/Minsk', priceChanges });
      const snapshot = await service.load('location', ReadConsistency.FRESH);
      expect(snapshot.timezone).toBe('Europe/Minsk');
      expect(snapshot.priceChanges).toEqual(priceChanges);
      expect(getLocale).toHaveBeenCalledWith('location');
      expect(listScheduledChanges).toHaveBeenCalledWith('location');
    });

    it('reads the rules and the step of the requested location only', async () => {
      const { service, listForSnapshot, findPriceRoundingStep } =
        pricingSnapshotService();
      await service.load('location', ReadConsistency.FRESH);
      expect(listForSnapshot).toHaveBeenCalledWith('location');
      expect(findPriceRoundingStep).toHaveBeenCalledWith('location');
    });

    it('serves rules from the cache until the pricing dependency is invalidated', async () => {
      const { service, cache, listForSnapshot } = pricingSnapshotService();
      await service.load('location', ReadConsistency.CACHED);
      await service.load('location', ReadConsistency.CACHED);
      expect(listForSnapshot).toHaveBeenCalledTimes(1);
      await cache.invalidate(CacheDependency.pricing('location'));
      await service.load('location', ReadConsistency.CACHED);
      expect(listForSnapshot).toHaveBeenCalledTimes(2);
    });
  });
});
