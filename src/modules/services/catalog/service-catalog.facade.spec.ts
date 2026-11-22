import { Prisma, ServiceStatus } from '@prisma/client';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { createTestCache } from '../../../shared/cache/testing/create-test-cache.js';
import { ServiceCatalogFacade } from './service-catalog.facade.js';

describe('ServiceCatalogFacade.loadCatalogSnapshot', () => {
  let cache: AppCacheService;
  let price: string;
  const serviceRow = () => ({
    id: 'service',
    categoryId: null,
    title: 'Cut',
    description: null,
    price: new Prisma.Decimal(price),
    durationMinutes: 60,
    bufferMinutes: 0,
    sortOrder: 0,
    status: ServiceStatus.ACTIVE,
    imageFile: null,
  });
  let services: { listActiveForBooking: ReturnType<typeof vi.fn> };
  let locations: { getBookingSettings: ReturnType<typeof vi.fn> };
  let facade: ServiceCatalogFacade;

  beforeEach(() => {
    cache = createTestCache();
    price = '20.00';
    services = { listActiveForBooking: vi.fn(async () => [serviceRow()]) };
    locations = {
      getBookingSettings: vi.fn(async () => ({ brandId: 'brand' })),
    };
    facade = new ServiceCatalogFacade(
      services as never,
      { listActiveForBooking: async () => [] } as never,
      {} as never,
      { listForBooking: async () => [] } as never,
      locations as never,
      cache,
    );
  });
  afterEach(() => cache.onModuleDestroy());

  const loadPrice = async (consistency: ReadConsistency) =>
    (
      await facade.loadCatalogSnapshot('location', consistency)
    ).services[0].price.toFixed(2);

  it('FRESH bypasses an enabled cache and reads the database on every call', async () => {
    expect(cache.enabled).toBe(true);
    expect(await loadPrice(ReadConsistency.CACHED)).toBe('20.00');
    price = '25.00';
    expect(await loadPrice(ReadConsistency.FRESH)).toBe('25.00');
    expect(await loadPrice(ReadConsistency.FRESH)).toBe('25.00');
    expect(services.listActiveForBooking).toHaveBeenCalledTimes(3);
  });

  it('FRESH does not fill the cache for later CACHED reads', async () => {
    await loadPrice(ReadConsistency.FRESH);
    await loadPrice(ReadConsistency.CACHED);
    expect(services.listActiveForBooking).toHaveBeenCalledTimes(2);
  });

  it('CACHED reads through the cache until the catalog of the location is invalidated', async () => {
    expect(await loadPrice(ReadConsistency.CACHED)).toBe('20.00');
    price = '25.00';
    expect(await loadPrice(ReadConsistency.CACHED)).toBe('20.00');
    expect(services.listActiveForBooking).toHaveBeenCalledTimes(1);

    await cache.invalidate(CacheDependency.serviceCatalog('other-location'));
    expect(await loadPrice(ReadConsistency.CACHED)).toBe('20.00');
    expect(services.listActiveForBooking).toHaveBeenCalledTimes(1);

    await cache.invalidate(CacheDependency.serviceCatalog('location'));
    expect(await loadPrice(ReadConsistency.CACHED)).toBe('25.00');
    expect(services.listActiveForBooking).toHaveBeenCalledTimes(2);
  });

  it('CACHED returns a copy, so a caller cannot change the cached snapshot', async () => {
    const first = await facade.loadCatalogSnapshot(
      'location',
      ReadConsistency.CACHED,
    );
    first.services[0].title = 'Changed';
    const second = await facade.loadCatalogSnapshot(
      'location',
      ReadConsistency.CACHED,
    );
    expect(second.services[0].title).toBe('Cut');
  });

  it('serves both consistencies from the same loader', async () => {
    const cached = await facade.loadCatalogSnapshot(
      'location',
      ReadConsistency.CACHED,
    );
    const fresh = await facade.loadCatalogSnapshot(
      'location',
      ReadConsistency.FRESH,
    );
    expect(fresh).toEqual(cached);
  });
});
