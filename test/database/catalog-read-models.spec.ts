import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { icuDataDir } from '@electric-sql/pglite-icu-full';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { DatabaseModule } from '../../src/database/database.module.js';
import { DatabaseService } from '../../src/database/database.service.js';
import { OrderDirection } from '../../src/shared/enums/order-direction.enum.js';
import { AUDIT_EVENT } from '../../src/modules/audit/constants/audit.constants.js';
import { AuditActorRole } from '../../src/modules/audit/enums/audit-actor-role.enum.js';
import { AuditEvent } from '../../src/modules/audit/enums/audit-event.enum.js';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../../src/modules/auth/guards/permission.guard.js';
import { TokenEpochGuard } from '../../src/modules/auth/guards/token-epoch.guard.js';
import { BookingExecutionMode } from '../../src/modules/bookings/enums/booking-execution-mode.enum.js';
import { LocationService } from '../../src/modules/location/services/location.service.js';
import { ServiceBundleWriteService } from '../../src/modules/services/bundle-write/services/service-bundle-write.service.js';
import { ServiceCatalogSearchRequestDto } from '../../src/modules/services/catalog/dto/service-catalog-search-request.dto.js';
import { ServiceCatalogFacade } from '../../src/modules/services/catalog/service-catalog.facade.js';
import { ServiceCatalogModule } from '../../src/modules/services/catalog/service-catalog.module.js';
import { ServiceCategoriesService } from '../../src/modules/services/categories/services/service-categories.service.js';
import { BundlePricingMode } from '../../src/modules/services/enums/bundle-pricing-mode.enum.js';
import { ServiceCatalogKind } from '../../src/modules/services/enums/service-catalog-kind.enum.js';
import { ServiceSearchOrderBy } from '../../src/modules/services/enums/service-search-order-by.enum.js';
import { ServiceStatus } from '../../src/modules/services/enums/service-status.enum.js';
import { ServiceWriteService } from '../../src/modules/services/service-write/services/service-write.service.js';

describe('catalog restored from migrations', () => {
  let pg: PGlite;
  let server: PGLiteSocketServer;
  let prisma: PrismaClient;
  let module: TestingModule;
  let catalog: ServiceCatalogFacade;
  let categories: ServiceCategoriesService;
  let services: ServiceWriteService;
  let bundles: ServiceBundleWriteService;
  let locationId: string;
  let otherLocationId: string;
  let categoryId: string;
  let firstId: string;
  let secondId: string;
  let bundleId: string;
  const actor = { name: 'Migration test', role: AuditActorRole.SYSTEM };
  const emit = vi.fn();

  beforeAll(async () => {
    pg = await PGlite.create({ icuDataDir: await icuDataDir() });
    const migrations = fileURLToPath(
      new URL('../../src/database/migrations/', import.meta.url),
    );
    for (const entry of (
      await readdir(migrations, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const sql = await readFile(
        `${migrations}/${entry.name}/migration.sql`,
        'utf8',
      );
      try {
        await pg.exec(sql);
      } catch (cause) {
        throw new Error(`Failed to restore migration ${entry.name}`, { cause });
      }
    }
    server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 0 });
    await server.start();
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: `postgresql://postgres@${server.getServerConn()}/postgres`,
        max: 1,
      }),
      transactionOptions: { timeout: 10_000 },
    });
    module = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        EventEmitterModule.forRoot(),
        ServiceCatalogModule,
      ],
    })
      .overrideProvider(DatabaseService)
      .useValue(prisma)
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TokenEpochGuard)
      .useValue({ canActivate: () => true })
      .compile();
    catalog = module.get(ServiceCatalogFacade);
    categories = module.get(ServiceCategoriesService);
    const db = prisma as unknown as DatabaseService;
    const events = { emit } as unknown as EventEmitter2;
    const location = {
      getLocale: async () => ({ currency: 'RUB' }),
    } as unknown as LocationService;
    services = new ServiceWriteService(db, events, location);
    bundles = new ServiceBundleWriteService(db, events, location, catalog);
  }, 60_000);

  afterAll(async () => {
    await module?.close();
    await prisma?.$disconnect();
    await server?.stop();
    await pg?.close();
  }, 15_000);

  beforeEach(async () => {
    emit.mockClear();
    const brand = await prisma.brand.create({ data: { name: 'Catalog test' } });
    const location = await prisma.location.create({
      data: {
        brandId: brand.id,
        name: 'Main',
        countryCode: 'RU',
        currency: 'RUB',
        timezone: 'Europe/Moscow',
      },
    });
    locationId = location.id;
    otherLocationId = (
      await prisma.location.create({
        data: {
          brandId: brand.id,
          name: 'Other',
          countryCode: 'RU',
          currency: 'RUB',
          timezone: 'Europe/Moscow',
        },
      })
    ).id;
    categoryId = (
      await categories.createCategory(locationId, { name: 'Уход' }, actor)
    ).id;
    firstId = (
      await services.create(
        locationId,
        {
          title: 'Альфа',
          categoryId,
          price: '100.00',
          durationMinutes: 30,
          bufferMinutes: 5,
        },
        actor,
      )
    ).id;
    secondId = (
      await services.create(
        locationId,
        {
          title: 'Бета',
          price: '200.00',
          durationMinutes: 40,
          bufferMinutes: 10,
        },
        actor,
      )
    ).id;
    bundleId = (
      await bundles.create(
        locationId,
        {
          title: 'Набор',
          categoryId,
          items: [{ serviceId: firstId }, { serviceId: secondId }],
        },
        actor,
      )
    ).id;
  });

  it('recreates SQL views and collation on an empty database', async () => {
    const result = await pg.query<{ name: string }>(`
      SELECT viewname AS name FROM pg_views WHERE schemaname = 'public'
      AND viewname IN ('ServiceCatalogView', 'InventoryStockView') ORDER BY viewname`);
    expect(result.rows.map((row) => row.name)).toEqual([
      'InventoryStockView',
      'ServiceCatalogView',
    ]);
    const collation = await pg.query<{ collprovider: string }>(
      "SELECT collprovider FROM pg_collation WHERE collname = 'catalog_ru'",
    );
    expect(collation.rows).toEqual([{ collprovider: 'i' }]);
  });

  it('orders and paginates services and bundles together through Prisma', async () => {
    const dto = Object.assign(new ServiceCatalogSearchRequestDto(), {
      pageSize: 2,
      orderBy: ServiceSearchOrderBy.PRICE,
      orderDirection: OrderDirection.ASC,
    });
    const first = await catalog.search(locationId, dto);
    const second = await catalog.search(locationId, { ...dto, page: 2 });
    expect(first.totalItems).toBe(3);
    expect(first.items.map((item) => item.id)).toEqual([firstId, secondId]);
    expect(second.items.map((item) => item.id)).toEqual([bundleId]);
    expect(second.items[0].price.toString()).toBe('300');
    expect(second.items[0].durationMinutes).toBe(85);
    expect(await catalog.search(otherLocationId, dto)).toEqual({
      items: [],
      totalItems: 0,
    });
    expect(
      await catalog.getCounts(locationId, { kind: ServiceCatalogKind.BUNDLE }),
    ).toEqual({
      total: 1,
      byStatus: [
        { status: ServiceStatus.ACTIVE, count: 1 },
        { status: ServiceStatus.INACTIVE, count: 0 },
      ],
      byKind: [
        { kind: ServiceCatalogKind.SERVICE, count: 2 },
        { kind: ServiceCatalogKind.BUNDLE, count: 1 },
      ],
    });
  });

  it('reflects category, service and bundle writes immediately in catalog reads', async () => {
    await categories.updateCategory(
      locationId,
      categoryId,
      { name: 'Новая категория' },
      actor,
    );
    await services.update(locationId, firstId, { price: '125.00' }, actor);
    const sum = await catalog.search(
      locationId,
      Object.assign(new ServiceCatalogSearchRequestDto(), {
        kind: ServiceCatalogKind.BUNDLE,
      }),
    );
    expect(sum.items[0].categoryName).toBe('Новая категория');
    expect(sum.items[0].price.toString()).toBe('325');
    await bundles.update(
      locationId,
      bundleId,
      {
        executionMode: BookingExecutionMode.PARALLEL,
        pricingMode: BundlePricingMode.FIXED,
        fixedPrice: '250.00',
      },
      actor,
    );
    const fixed = await catalog.search(
      locationId,
      Object.assign(new ServiceCatalogSearchRequestDto(), {
        kind: ServiceCatalogKind.BUNDLE,
      }),
    );
    expect(fixed.items[0].price.toString()).toBe('250');
    expect(fixed.items[0].durationMinutes).toBe(50);
    await bundles.changeStatus(
      locationId,
      bundleId,
      ServiceStatus.INACTIVE,
      actor,
    );
    expect((await catalog.loadForBooking(locationId)).bundles).toEqual([]);
    await bundles.delete(locationId, bundleId, actor);
    await services.delete(locationId, firstId, actor);
    await categories.deleteCategory(locationId, categoryId, actor);
    expect(
      (
        await catalog.search(locationId, new ServiceCatalogSearchRequestDto())
      ).items.map((item) => item.id),
    ).toEqual([secondId]);
    expect(emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({ eventType: AuditEvent.SERVICE_BUNDLE_DELETED }),
    );
    expect(emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({ eventType: AuditEvent.SERVICE_DELETED }),
    );
  });

  it('rejects detail reads and bundle services from another location', async () => {
    await expect(
      catalog.findServiceById(otherLocationId, firstId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      catalog.findBundleById(otherLocationId, bundleId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      bundles.create(
        otherLocationId,
        {
          title: 'Invalid',
          items: [{ serviceId: firstId }, { serviceId: secondId }],
        },
        actor,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await prisma.serviceBundle.count({
        where: { locationId: otherLocationId },
      }),
    ).toBe(0);
  });
});
