import {
  Prisma,
  PriceChangeCatalog,
  PriceChangeSkip,
  PriceChangeTarget,
} from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { PRICE_CHANGE_SYSTEM_ACTOR, PriceChangeApplier } from './price-change-applier.service.js';

const productItem = (id: string, productLocationId: string | null, after: string) => ({
  id,
  targetType: PriceChangeTarget.PRODUCT,
  serviceId: null,
  priceLevelId: null,
  staffId: null,
  bundleId: null,
  productLocationId,
  beforePrice: new Prisma.Decimal('50.00'),
  afterPrice: new Prisma.Decimal(after),
});

function setup() {
  const items = [
    productItem('i1', 'pl-1', '60.00'),
    productItem('i2', 'pl-2', '70.00'),
    productItem('i3', null, '80.00'),
  ];
  const tx = {
    priceChange: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'ch1',
        locationId: 'loc',
        catalog: PriceChangeCatalog.PRODUCTS,
        title: '+10%',
        items,
      })),
      update: vi.fn(async (..._args: unknown[]) => ({})),
    },
  };
  const store = {
    loadStates: vi.fn(
      async () =>
        new Map([
          ['i1', { skip: null, current: 5500 }],
          ['i2', { skip: PriceChangeSkip.NOT_FOR_SALE, current: null }],
          ['i3', { skip: PriceChangeSkip.TARGET_DELETED, current: null }],
        ]),
    ),
    writePrices: vi.fn(async (..._args: unknown[]) => undefined),
    markApplied: vi.fn(async (..._args: unknown[]) => undefined),
  };
  const cache = { invalidate: vi.fn(async () => undefined) };
  const eventEmitter = { emit: vi.fn() };
  const applier = new PriceChangeApplier(
    store as never,
    {} as never,
    cache as never,
    eventEmitter as never,
  );
  return { applier, tx, store, cache, eventEmitter };
}

describe('PriceChangeApplier with product rows', () => {
  it('writes the sold products and skips NOT_FOR_SALE and TARGET_DELETED, "before" is the stored price', async () => {
    const { applier, tx, store } = setup();
    const applied = await applier.apply(tx as never, 'ch1', new Date());
    expect(store.writePrices.mock.calls[0][2]).toEqual([{ itemId: 'i1', price: 6000 }]);
    expect(store.markApplied.mock.calls[0][1]).toEqual([
      { itemId: 'i1', before: 5500, skip: null, rolledBack: false },
      { itemId: 'i2', before: null, skip: PriceChangeSkip.NOT_FOR_SALE, rolledBack: false },
      { itemId: 'i3', before: null, skip: PriceChangeSkip.TARGET_DELETED, rolledBack: false },
    ]);
    expect(tx.priceChange.update).toHaveBeenCalledWith({
      where: { id: 'ch1' },
      data: { applySkippedCount: 2 },
    });
    expect(applied).toEqual({
      changeId: 'ch1',
      locationId: 'loc',
      catalog: PriceChangeCatalog.PRODUCTS,
      title: '+10%',
      appliedCount: 1,
      applySkippedCount: 2,
    });
  });

  it('announces a product change: pricing and location products caches, product audit event', async () => {
    const { applier, cache, eventEmitter } = setup();
    await applier.announce(
      {
        changeId: 'ch1',
        locationId: 'loc',
        catalog: PriceChangeCatalog.PRODUCTS,
        title: '+10%',
        appliedCount: 1,
        applySkippedCount: 2,
      },
      PRICE_CHANGE_SYSTEM_ACTOR,
    );
    expect(cache.invalidate).toHaveBeenCalledWith(CacheDependency.pricing('loc'));
    expect(cache.invalidate).toHaveBeenCalledWith(
      CacheDependency.locationProducts('loc'),
    );
    expect(cache.invalidate).not.toHaveBeenCalledWith(
      CacheDependency.serviceCatalog('loc'),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        entityType: AuditEntity.PRODUCT_PRICE_CHANGE,
        eventType: AuditEvent.PRODUCT_PRICE_CHANGE_APPLIED,
        payload: { title: '+10%', appliedCount: 1, applySkippedCount: 2 },
      }),
    );
  });
});
