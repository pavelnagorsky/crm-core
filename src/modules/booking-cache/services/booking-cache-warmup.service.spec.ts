import { BookingCacheWarmupEvent } from '../../../shared/events/booking-cache-warmup.event.js';
import { BookingCacheWarmupService } from './booking-cache-warmup.service.js';

function setup(enabled = true) {
  const cache = { enabled };
  const locations = {
    listPublicBookingTargets: vi
      .fn()
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
      .mockResolvedValue([]),
    warmBookingSettings: vi.fn().mockResolvedValue(undefined),
    getBookingSettings: vi
      .fn()
      .mockResolvedValue({ brandId: 'brand', bookingVisibility: 'PUBLIC' }),
  };
  const brands = { warmPublicProfile: vi.fn().mockResolvedValue(undefined) };
  const catalog = { warmForBooking: vi.fn().mockResolvedValue(undefined) };
  const staff = {
    warmBookingDirectory: vi.fn().mockResolvedValue(undefined),
    warmBookingSchedule: vi.fn().mockResolvedValue(undefined),
  };
  const products = { warmPublicCatalog: vi.fn().mockResolvedValue(undefined) };
  const service = new BookingCacheWarmupService(
    cache as never,
    locations as never,
    brands as never,
    catalog as never,
    staff as never,
    products as never,
  );
  return { service, locations, cache, catalog, staff, products };
}

describe('Public booking cache warmup', () => {
  it('waits for an event-triggered pass and still performs the full startup sweep', async () => {
    const { service, locations, staff } = setup();
    let release!: () => void;
    staff.warmBookingSchedule.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    service.request(new BookingCacheWarmupEvent('created'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(staff.warmBookingSchedule).toHaveBeenCalledWith('created');
    const bootstrap = service.onApplicationBootstrap();
    await Promise.resolve();
    expect(locations.listPublicBookingTargets).not.toHaveBeenCalled();
    release();
    await bootstrap;
    expect(locations.listPublicBookingTargets).toHaveBeenCalledTimes(2);
    expect(staff.warmBookingSchedule.mock.calls).toEqual([
      ['created'],
      ['a'],
      ['b'],
    ]);
    service.onModuleDestroy();
  });

  it('awaits warming all datasets before bootstrap completes and pages targets', async () => {
    const { service, locations, staff, catalog, products } = setup();
    await service.onApplicationBootstrap();
    expect(locations.listPublicBookingTargets.mock.calls).toEqual([
      [undefined],
      ['b'],
    ]);
    for (const operation of [
      catalog.warmForBooking,
      staff.warmBookingDirectory,
      staff.warmBookingSchedule,
      products.warmPublicCatalog,
    ])
      expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not announce readiness while a loader is pending', async () => {
    const { service, staff } = setup();
    let release!: () => void;
    staff.warmBookingSchedule.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    let ready = false;
    const bootstrap = service.onApplicationBootstrap().then(() => {
      ready = true;
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(staff.warmBookingSchedule).toHaveBeenCalled();
    expect(ready).toBe(false);
    release();
    await bootstrap;
    expect(ready).toBe(true);
  });

  it('fails bootstrap on errors but allows a later cron pass to retry', async () => {
    const { service, locations, catalog } = setup();
    catalog.warmForBooking.mockRejectedValueOnce(new Error('DB unavailable'));
    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'DB unavailable',
    );
    locations.listPublicBookingTargets
      .mockReset()
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValue([]);
    await service.refreshPublicLocations();
    expect(catalog.warmForBooking).toHaveBeenCalledTimes(3);
  });

  it('discovers targets independently of existing cache entries on every sweep', async () => {
    const { service, locations, catalog } = setup();
    await service.refreshPublicLocations();
    locations.listPublicBookingTargets
      .mockReset()
      .mockResolvedValueOnce([{ id: 'new' }])
      .mockResolvedValue([]);
    await service.refreshPublicLocations();
    expect(catalog.warmForBooking).toHaveBeenLastCalledWith('new');
  });

  it('skips startup, cron and event-driven warmup when cache is disabled', async () => {
    const { service, locations } = setup(false);
    await service.onApplicationBootstrap();
    await service.refreshPublicLocations();
    service.request(new BookingCacheWarmupEvent('created'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(locations.listPublicBookingTargets).not.toHaveBeenCalled();
    expect(locations.warmBookingSettings).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
});
