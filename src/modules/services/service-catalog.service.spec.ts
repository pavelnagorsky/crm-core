import { Prisma, ServiceStatus } from '@prisma/client';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { BookingExecutionMode } from '../bookings/enums/booking-execution-mode.enum.js';
import { ServiceCatalogSearchRequestDto } from './dto/service-catalog-search-request.dto.js';
import { ServiceCatalogItemDto } from './dto/service-catalog-item.dto.js';
import { BundlePricingMode } from './enums/bundle-pricing-mode.enum.js';
import { ServiceCatalogKind } from './enums/service-catalog-kind.enum.js';
import { ServiceSearchOrderBy } from './enums/service-search-order-by.enum.js';
import { ServiceBundleForCatalog } from './interfaces/service-bundle-for-catalog.interface.js';
import { ServiceForCatalog } from './interfaces/service-for-catalog.interface.js';
import { ServiceCatalogService } from './service-catalog.service.js';
import { ServiceBundleService } from './service-bundle.service.js';
import { ServicesService } from './services.service.js';

function serviceRow(overrides: Partial<ServiceForCatalog> = {}): ServiceForCatalog {
  return {
    id: 'service-1',
    businessId: 'biz',
    categoryId: 'cat-cut',
    imageFileId: null,
    title: 'Стрижка',
    description: 'Мужская стрижка',
    price: new Prisma.Decimal('40.00'),
    durationMinutes: 45,
    bufferMinutes: 10,
    status: ServiceStatus.ACTIVE,
    sortOrder: 2,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    imageFile: null,
    category: { name: 'Волосы' },
    _count: { staffServices: 1 },
    ...overrides,
  };
}

function bundleRow(overrides: Partial<ServiceBundleForCatalog> = {}): ServiceBundleForCatalog {
  return {
    id: 'bundle-1',
    businessId: 'biz',
    categoryId: 'cat-color',
    imageFileId: null,
    title: 'Окрашивание+',
    description: 'Комплекс окрашивания',
    executionMode: BookingExecutionMode.SEQUENTIAL,
    pricingMode: BundlePricingMode.SUM,
    fixedPrice: null,
    status: ServiceStatus.ACTIVE,
    sortOrder: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    imageFile: null,
    category: { name: 'Цвет' },
    items: [
      {
        sortOrder: 0,
        service: {
          title: 'Окрашивание',
          price: new Prisma.Decimal('80.00'),
          durationMinutes: 60,
          bufferMinutes: 0,
        },
      },
      {
        sortOrder: 1,
        service: {
          title: 'Укладка',
          price: new Prisma.Decimal('20.00'),
          durationMinutes: 30,
          bufferMinutes: 0,
        },
      },
    ],
    ...overrides,
  };
}

function request(
  overrides: Partial<ServiceCatalogSearchRequestDto> = {},
): ServiceCatalogSearchRequestDto {
  return {
    page: 1,
    pageSize: 25,
    ...overrides,
  } as ServiceCatalogSearchRequestDto;
}

describe('ServiceCatalogService', () => {
  const services = {
    listForCatalog: vi.fn(),
    countForCatalog: vi.fn(),
    countByStatusForCatalog: vi.fn(),
  };
  const bundles = {
    listForCatalog: vi.fn(),
    countForCatalog: vi.fn(),
    countByStatusForCatalog: vi.fn(),
  };
  const catalog = new ServiceCatalogService(
    services as unknown as ServicesService,
    bundles as unknown as ServiceBundleService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    services.listForCatalog.mockResolvedValue([serviceRow()]);
    bundles.listForCatalog.mockResolvedValue([bundleRow()]);
    services.countForCatalog.mockResolvedValue(1);
    bundles.countForCatalog.mockResolvedValue(1);
    services.countByStatusForCatalog.mockResolvedValue([{ status: ServiceStatus.ACTIVE, count: 1 }]);
    bundles.countByStatusForCatalog.mockResolvedValue([{ status: ServiceStatus.ACTIVE, count: 1 }]);
  });

  it('returns SERVICE and BUNDLE rows together', async () => {
    const { items, totalItems } = await catalog.search('biz', request());

    expect(totalItems).toBe(2);
    expect(items.map((item) => item.kind).sort()).toEqual([
      ServiceCatalogKind.BUNDLE,
      ServiceCatalogKind.SERVICE,
    ]);
    expect(services.listForCatalog).toHaveBeenCalledWith('biz', {
      search: undefined,
      categoryId: undefined,
      status: undefined,
    });
    expect(bundles.listForCatalog).toHaveBeenCalledWith('biz', {
      search: undefined,
      categoryId: undefined,
      status: undefined,
    });
  });

  it('filters by kind', async () => {
    const servicesOnly = await catalog.search(
      'biz',
      request({ kind: ServiceCatalogKind.SERVICE }),
    );
    expect(servicesOnly.items).toHaveLength(1);
    expect(servicesOnly.items[0].kind).toBe(ServiceCatalogKind.SERVICE);
    expect(bundles.listForCatalog).not.toHaveBeenCalled();

    const bundlesOnly = await catalog.search(
      'biz',
      request({ kind: ServiceCatalogKind.BUNDLE }),
    );
    expect(bundlesOnly.items).toHaveLength(1);
    expect(bundlesOnly.items[0].kind).toBe(ServiceCatalogKind.BUNDLE);
    expect(services.listForCatalog).toHaveBeenCalledTimes(1);
  });

  it('forwards status, category and search filters to both entity types', async () => {
    await catalog.search(
      'biz',
      request({
        search: '  окрашивание  ',
        categoryId: 'cat-color',
        status: ServiceStatus.INACTIVE,
      }),
    );

    const expected = {
      search: '  окрашивание  ',
      categoryId: 'cat-color',
      status: ServiceStatus.INACTIVE,
    };
    expect(services.listForCatalog).toHaveBeenCalledWith('biz', expected);
    expect(bundles.listForCatalog).toHaveBeenCalledWith('biz', expected);
  });

  it('sorts mixed rows by price, duration, title and sortOrder', async () => {
    services.listForCatalog.mockResolvedValue([
      serviceRow({ id: 's-cheap', title: 'Блонд', price: new Prisma.Decimal('10.00'), durationMinutes: 30, sortOrder: 5 }),
    ]);
    bundles.listForCatalog.mockResolvedValue([
      bundleRow({ id: 'b-expensive', title: 'Акция', sortOrder: 1 }),
    ]);

    const byPrice = await catalog.search(
      'biz',
      request({ orderBy: ServiceSearchOrderBy.PRICE, orderDirection: OrderDirection.ASC }),
    );
    expect(byPrice.items.map((item) => item.id)).toEqual(['s-cheap', 'b-expensive']);

    const byDuration = await catalog.search(
      'biz',
      request({ orderBy: ServiceSearchOrderBy.DURATION_MINUTES, orderDirection: OrderDirection.ASC }),
    );
    expect(byDuration.items.map((item) => item.durationMinutes)).toEqual([30, 90]);

    const byTitle = await catalog.search(
      'biz',
      request({ orderBy: ServiceSearchOrderBy.TITLE, orderDirection: OrderDirection.ASC }),
    );
    expect(byTitle.items.map((item) => item.title)).toEqual(['Акция', 'Блонд']);

    const bySortOrder = await catalog.search(
      'biz',
      request({ orderBy: ServiceSearchOrderBy.SORT_ORDER, orderDirection: OrderDirection.ASC }),
    );
    expect(bySortOrder.items.map((item) => item.id)).toEqual(['b-expensive', 's-cheap']);
  });

  it('keeps rows without a category last in both directions', async () => {
    services.listForCatalog.mockResolvedValue([
      serviceRow({ id: 'no-cat', categoryId: null, category: null, title: 'Без категории' }),
      serviceRow({ id: 'with-cat', categoryId: 'cat-cut', category: { name: 'Волосы' }, title: 'Стрижка' }),
    ]);
    bundles.listForCatalog.mockResolvedValue([]);

    const asc = await catalog.search('biz', request({
      orderBy: ServiceSearchOrderBy.CATEGORY,
      orderDirection: OrderDirection.ASC,
    }));
    const desc = await catalog.search('biz', request({
      orderBy: ServiceSearchOrderBy.CATEGORY,
      orderDirection: OrderDirection.DESC,
    }));

    expect(asc.items.map((item) => item.id)).toEqual(['with-cat', 'no-cat']);
    expect(desc.items.map((item) => item.id)).toEqual(['with-cat', 'no-cat']);
  });

  it('paginates the unified result', async () => {
    services.listForCatalog.mockResolvedValue([
      serviceRow({ id: 's-1', sortOrder: 1, title: 'A' }),
    ]);
    bundles.listForCatalog.mockResolvedValue([
      bundleRow({ id: 'b-1', sortOrder: 2, title: 'B' }),
    ]);

    const page1 = await catalog.search(
      'biz',
      request({
        page: 1,
        pageSize: 1,
        orderBy: ServiceSearchOrderBy.SORT_ORDER,
        orderDirection: OrderDirection.ASC,
      }),
    );
    expect(page1.totalItems).toBe(2);
    expect(page1.items.map((item) => item.id)).toEqual(['s-1']);

    const page2 = await catalog.search(
      'biz',
      request({
        page: 2,
        pageSize: 1,
        orderBy: ServiceSearchOrderBy.SORT_ORDER,
        orderDirection: OrderDirection.ASC,
      }),
    );
    expect(page2.totalItems).toBe(2);
    expect(page2.items.map((item) => item.id)).toEqual(['b-1']);
  });

  it('maps bundle metrics without loading full items into the list DTO', async () => {
    const { items } = await catalog.search('biz', request({ kind: ServiceCatalogKind.BUNDLE }));
    const dto = ServiceCatalogItemDto.fromEntity(items[0]);

    expect(dto.price).toBe('100.00');
    expect(dto.durationMinutes).toBe(90);
    expect(dto.itemsCount).toBe(2);
    expect(dto.itemTitles).toEqual(['Окрашивание', 'Укладка']);
    expect(dto.executionMode).toBe(BookingExecutionMode.SEQUENTIAL);
    expect(dto.pricingMode).toBe(BundlePricingMode.SUM);
    expect(dto.bufferMinutes).toBeUndefined();
    expect(dto.hasNoStaff).toBeUndefined();
  });

  it('flags services without staff and keeps bufferMinutes', async () => {
    services.listForCatalog.mockResolvedValue([
      serviceRow({ _count: { staffServices: 0 }, bufferMinutes: 15 }),
    ]);
    const { items } = await catalog.search('biz', request({ kind: ServiceCatalogKind.SERVICE }));
    const dto = ServiceCatalogItemDto.fromEntity(items[0]);

    expect(dto.hasNoStaff).toBe(true);
    expect(dto.bufferMinutes).toBe(15);
    expect(dto.itemsCount).toBeUndefined();
  });

  it('computes total, byStatus and byKind, ignoring the facet own filter', async () => {
    services.countForCatalog.mockImplementation(async (_businessId, filter) => {
      if (filter.status === ServiceStatus.INACTIVE) return 0;
      if (filter.status === ServiceStatus.ACTIVE) return 2;
      return 3;
    });
    bundles.countForCatalog.mockImplementation(async (_businessId, filter) => {
      if (filter.status === ServiceStatus.INACTIVE) return 1;
      if (filter.status === ServiceStatus.ACTIVE) return 1;
      return 2;
    });
    services.countByStatusForCatalog.mockResolvedValue([
      { status: ServiceStatus.ACTIVE, count: 2 },
      { status: ServiceStatus.INACTIVE, count: 1 },
    ]);
    bundles.countByStatusForCatalog.mockResolvedValue([
      { status: ServiceStatus.ACTIVE, count: 1 },
      { status: ServiceStatus.INACTIVE, count: 1 },
    ]);

    const counts = await catalog.getCounts('biz', {
      search: 'стриж',
      categoryId: 'cat-cut',
      status: ServiceStatus.ACTIVE,
      kind: ServiceCatalogKind.SERVICE,
    });

    expect(counts.total).toBe(2);
    expect(counts.byStatus).toEqual([
      { status: ServiceStatus.ACTIVE, count: 2 },
      { status: ServiceStatus.INACTIVE, count: 1 },
    ]);
    expect(counts.byKind).toEqual([
      { kind: ServiceCatalogKind.SERVICE, count: 2 },
      { kind: ServiceCatalogKind.BUNDLE, count: 1 },
    ]);

    expect(services.countByStatusForCatalog).toHaveBeenCalledTimes(1);
    expect(services.countByStatusForCatalog).toHaveBeenCalledWith('biz', {
      search: 'стриж',
      categoryId: 'cat-cut',
    });
    expect(bundles.countByStatusForCatalog).not.toHaveBeenCalled();
    expect(services.countForCatalog).toHaveBeenCalledTimes(1);
    expect(services.countForCatalog).toHaveBeenCalledWith('biz', {
      search: 'стриж',
      categoryId: 'cat-cut',
      status: ServiceStatus.ACTIVE,
    });
    expect(bundles.countForCatalog).toHaveBeenCalledTimes(1);
    expect(bundles.countForCatalog).toHaveBeenCalledWith('biz', {
      search: 'стриж',
      categoryId: 'cat-cut',
      status: ServiceStatus.ACTIVE,
    });
  });

  it('fills missing facet statuses with zero', async () => {
    services.countByStatusForCatalog.mockResolvedValue([]);
    bundles.countByStatusForCatalog.mockResolvedValue([]);
    services.countForCatalog.mockResolvedValue(0);
    bundles.countForCatalog.mockResolvedValue(0);

    const counts = await catalog.getCounts('biz', {});
    expect(counts.byStatus).toEqual([
      { status: ServiceStatus.ACTIVE, count: 0 },
      { status: ServiceStatus.INACTIVE, count: 0 },
    ]);
    expect(counts.byKind).toEqual([
      { kind: ServiceCatalogKind.SERVICE, count: 0 },
      { kind: ServiceCatalogKind.BUNDLE, count: 0 },
    ]);
  });
});
