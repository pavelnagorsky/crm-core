import {
  Prisma,
  PriceChangeCatalog,
  PriceChangeSource,
  PriceChangeTarget,
} from '@prisma/client';
import { rejectedAppException } from '../testing/rejected-app-exception.js';
import { PriceChangeWriter } from './price-change-writer.service.js';

const draft = (productLocationId: string) => ({
  targetType: PriceChangeTarget.PRODUCT,
  serviceId: null,
  priceLevelId: null,
  staffId: null,
  bundleId: null,
  productLocationId,
  targetTitle: 'Шампунь',
  levelName: null,
  staffName: null,
  beforePrice: new Prisma.Decimal('55.00'),
  afterPrice: new Prisma.Decimal('60.00'),
});

function setup(conflicts: object[], scheduled = 0) {
  const tx = {
    priceChange: {
      findMany: vi.fn(async (..._args: unknown[]) => conflicts),
      count: vi.fn(async () => scheduled),
      create: vi.fn(async (..._args: unknown[]) => ({ id: 'new' })),
    },
  };
  const applier = {
    apply: vi.fn(async () => null),
    takeDueApplied: vi.fn(() => []),
  };
  const locations = {
    getLocale: vi.fn(async () => ({ timezone: 'UTC', currency: 'BYN' })),
  };
  const writer = new PriceChangeWriter(
    {} as never,
    applier as never,
    locations as never,
    {} as never,
    {} as never,
  );
  const input = {
    locationId: 'loc',
    catalog: PriceChangeCatalog.PRODUCTS,
    source: PriceChangeSource.RULE,
    effectiveDate: '2027-01-01',
    ruleSpec: { mode: 'PERCENT', value: '10.00', priceRoundingStep: '0.01' },
    fileName: null,
    createdServicesCount: 0,
    items: [draft('pl-a'), draft('pl-b')],
    productIds: new Map([
      ['pl-a', 'p-a'],
      ['pl-b', 'p-b'],
    ]),
    actor: { id: 'user-1', name: 'Анна', role: 'OWNER' } as never,
    now: new Date('2026-11-25T10:00:00Z'),
  };
  return { writer, tx, input };
}

describe('PriceChangeWriter with products', () => {
  it('409 PRICE_CHANGE_DATE_CONFLICT with the shared products by Product.id', async () => {
    const { writer, tx, input } = setup([
      {
        id: 'old',
        title: '+5%',
        effectiveDate: new Date('2027-01-01T00:00:00Z'),
        items: [{ serviceId: null, bundleId: null, productLocationId: 'pl-a' }],
      },
    ]);
    const error = await rejectedAppException(writer.write(tx as never, input));
    expect(error.errorCode).toBe('PRICE_CHANGE_DATE_CONFLICT');
    expect(error.getStatus()).toBe(409);
    expect(error.payload).toEqual({
      changeId: 'old',
      title: '+5%',
      effectiveDate: '2027-01-01',
      serviceIds: [],
      bundleIds: [],
      productIds: ['p-a'],
    });
    expect(tx.priceChange.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        items: {
          some: { OR: [{ productLocationId: { in: ['pl-a', 'pl-b'] } }] },
        },
      },
    });
  });

  it('counts the scheduled changes of the same catalog for the limit', async () => {
    const { writer, tx, input } = setup([], 50);
    const error = await rejectedAppException(writer.write(tx as never, input));
    expect(error.errorCode).toBe('PRICE_CHANGE_LIMIT');
    expect(tx.priceChange.count).toHaveBeenCalledWith({
      where: {
        locationId: 'loc',
        catalog: PriceChangeCatalog.PRODUCTS,
        status: 'SCHEDULED',
      },
    });
  });

  it('stores a scheduled product change with its catalog and products count', async () => {
    const { writer, tx, input } = setup([], 3);
    const result = await writer.write(tx as never, input);
    expect(result).toEqual({ changeId: 'new', applied: false, dueApplied: [] });
    expect(tx.priceChange.create.mock.calls[0][0]).toMatchObject({
      data: {
        catalog: PriceChangeCatalog.PRODUCTS,
        title: '+10%',
        productsCount: 2,
        servicesCount: 0,
        bundlesCount: 0,
        itemsCount: 2,
      },
    });
  });
});
