import { Prisma, ServiceStatus } from '@prisma/client';
import { AuditActorRole } from '../../modules/audit/enums/audit-actor-role.enum.js';
import { BrandService } from '../../modules/brand/services/brand.service.js';
import { LocationService } from '../../modules/location/services/location.service.js';
import { ProductsService } from '../../modules/products/services/products.service.js';
import { ServiceCatalogFacade } from '../../modules/services/catalog/service-catalog.facade.js';
import { ServiceWriteService } from '../../modules/services/service-write/services/service-write.service.js';
import { StaffService } from '../../modules/staff/services/staff.service.js';
import { AppCacheService } from './app-cache.service.js';
import { createTestCache } from './testing/create-test-cache.js';

const actor = { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER };

describe('Cache invalidation through domain writes', () => {
  let cache: AppCacheService;
  beforeEach(() => {
    cache = createTestCache();
  });
  afterEach(() => cache.onModuleDestroy());

  it('refreshes staff service assignments even when no audit fields changed', async () => {
    let serviceIds = ['old'];
    const row = {
      id: 'anna',
      name: 'Anna',
      status: 'ACTIVE',
      avatarFile: null,
    };
    const db = {
      staff: {
        findFirst: vi.fn().mockResolvedValue(row),
        findMany: vi.fn(async () => [
          {
            ...row,
            staffServices: serviceIds.map((serviceId) => ({ serviceId })),
          },
        ]),
        update: vi.fn(async () => {
          serviceIds = ['new'];
          return row;
        }),
      },
    };
    const events = { emit: vi.fn() };
    const locations = {
      getBookingSettings: async () => ({ brandId: 'brand' }),
    };
    const staff = new StaffService(
      db as never,
      events as never,
      locations as never,
      {} as never,
      {} as never,
      {} as never,
      cache,
    );
    expect(
      (await staff.listActiveWithServices('location'))[0].staffServices,
    ).toEqual([{ serviceId: 'old' }]);
    await staff.update('location', 'anna', { serviceIds: ['new'] }, actor);
    expect(events.emit).not.toHaveBeenCalled();
    expect(
      (await staff.listActiveWithServices('location'))[0].staffServices,
    ).toEqual([{ serviceId: 'new' }]);
    expect(db.staff.findMany).toHaveBeenCalledTimes(2);
  });

  it('shares brand products across locations and invalidates a changed product for both', async () => {
    let name = 'Old';
    const db = {
      product: {
        findMany: vi.fn(async () => [
          { id: 'product', name, categoryId: null },
        ]),
        findFirst: vi.fn(async () => ({ id: 'product', name })),
        update: vi.fn(async () => ({ id: 'product', name: (name = 'New') })),
      },
      productCategory: { findMany: vi.fn().mockResolvedValue([]) },
      productLocation: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { productId: 'product', retailPrice: new Prisma.Decimal('12.30') },
          ]),
      },
      $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work(db),
      ),
    };
    const products = new ProductsService(
      db as never,
      { getBookingSettings: async () => ({ brandId: 'brand' }) } as never,
      { emit: vi.fn() } as never,
      cache,
    );
    await products.listForPublicCatalog('a');
    await products.listForPublicCatalog('b');
    expect(db.product.findMany).toHaveBeenCalledTimes(1);
    await products.update('brand', 'product', { name: 'New' }, actor);
    expect((await products.listForPublicCatalog('a'))[0].product.name).toBe(
      'New',
    );
    expect((await products.listForPublicCatalog('b'))[0].product.name).toBe(
      'New',
    );
    expect(db.product.findMany).toHaveBeenCalledTimes(2);
    expect(db.productLocation.findMany).toHaveBeenCalledTimes(2);
  });

  it('refreshes a local price without reloading the shared product catalog', async () => {
    let price = new Prisma.Decimal('10');
    const db = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'product', name: 'Product', categoryId: null },
          ]),
        findFirst: vi.fn().mockResolvedValue({
          id: 'product',
          brandId: 'brand',
          name: 'Product',
        }),
      },
      productCategory: { findMany: vi.fn().mockResolvedValue([]) },
      productLocation: {
        findMany: vi.fn(async () => [
          { productId: 'product', retailPrice: price },
        ]),
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(async () => ({
          productId: 'product',
          retailPrice: (price = new Prisma.Decimal('20')),
        })),
      },
    };
    const locations = {
      getBookingSettings: async () => ({ brandId: 'brand' }),
      findById: async () => ({ brandId: 'brand', currency: 'BYN' }),
    };
    const products = new ProductsService(
      db as never,
      locations as never,
      { emit: vi.fn() } as never,
      cache,
    );
    await products.listForPublicCatalog('a');
    await products.listForPublicCatalog('b');
    await products.upsertLocation(
      'a',
      'product',
      { retailPrice: '20', status: 'ACTIVE', trackInventory: false } as never,
      actor,
    );
    expect(
      (await products.listForPublicCatalog('a'))[0].retailPrice.toString(),
    ).toBe('20');
    expect(
      (await products.listForPublicCatalog('b'))[0].retailPrice.toString(),
    ).toBe('10');
    expect(db.product.findMany).toHaveBeenCalledTimes(1);
    expect(db.productLocation.findMany).toHaveBeenCalledTimes(3);
  });

  it('updates a service price inside both the catalog and its bundles', async () => {
    let price = new Prisma.Decimal('10');
    const serviceRow = () => ({
      id: 'service',
      categoryId: null,
      price,
      title: 'Service',
      durationMinutes: 30,
      bufferMinutes: 0,
      sortOrder: 0,
      status: ServiceStatus.ACTIVE,
    });
    const reads = { listActiveForBooking: vi.fn(async () => [serviceRow()]) };
    const bundles = {
      listActiveForBooking: vi.fn(async () => [
        {
          id: 'bundle',
          categoryId: null,
          items: [
            { serviceId: 'service', sortOrder: 0, service: serviceRow() },
          ],
        },
      ]),
    };
    const locations = {
      getBookingSettings: async () => ({ brandId: 'brand' }),
      getLocale: async () => ({ currency: 'BYN' }),
    };
    const catalog = new ServiceCatalogFacade(
      reads as never,
      bundles as never,
      {} as never,
      { listForBooking: async () => [] } as never,
      locations as never,
      cache,
    );
    const db = {
      service: {
        findFirst: vi.fn(async () => serviceRow()),
        update: vi.fn(async () => {
          price = new Prisma.Decimal('25');
          return serviceRow();
        }),
      },
    };
    const writes = new ServiceWriteService(
      db as never,
      { emit: vi.fn() } as never,
      locations as never,
      cache,
    );
    await catalog.loadForBooking('location');
    await writes.update('location', 'service', { price: '25' }, actor);
    const updated = await catalog.loadForBooking('location');
    expect(updated.services[0].price.toString()).toBe('25');
    expect(updated.bundles[0].items[0].service).toBe(updated.services[0]);
    expect(reads.listActiveForBooking).toHaveBeenCalledTimes(2);
  });

  it('does not invalidate settings on rollback and rejects cached children after brand deletion', async () => {
    let deleted = false;
    const db = {
      location: {
        findUnique: vi.fn(async () =>
          deleted
            ? null
            : { id: 'location', brandId: 'brand', timezone: 'UTC' },
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      brand: {
        updateMany: vi.fn(async () => {
          deleted = true;
          return { count: 1 };
        }),
      },
      $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work(db),
      ),
    };
    const locations = new LocationService(
      db as never,
      {} as never,
      {} as never,
      {
        assertLocationDeletionAllowed: async () => {
          throw new Error('open bookings');
        },
      } as never,
      cache,
    );
    await locations.getBookingSettings('location');
    await expect(locations.delete('location')).rejects.toThrow('open bookings');
    await locations.getBookingSettings('location');
    expect(db.location.findUnique).toHaveBeenCalledTimes(1);
    const brands = new BrandService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      { assertBrandDeletionAllowed: vi.fn() } as never,
      {} as never,
      cache,
    );
    await brands.delete('brand');
    await expect(locations.getBookingSettings('location')).rejects.toThrow(
      'Location not found',
    );
    expect(db.location.findUnique).toHaveBeenCalledTimes(2);
  });
});
