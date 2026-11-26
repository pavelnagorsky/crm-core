import {
  Prisma,
  PriceChangeCatalog,
  PriceChangeSkip,
  PriceChangeStatus,
  PriceChangeTarget,
} from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { rejectedAppException } from '../testing/rejected-app-exception.js';
import { PriceChangeLifecycleService } from './price-change-lifecycle.service.js';

const ACTOR = { id: 'user-1', name: 'Анна', role: 'OWNER' } as never;

const item = (
  id: string,
  before: string,
  after: string,
  applySkip: PriceChangeSkip | null = null,
) => ({
  id,
  targetType: PriceChangeTarget.PRODUCT,
  productLocationId: `pl-${id}`,
  beforePrice: new Prisma.Decimal(before),
  afterPrice: new Prisma.Decimal(after),
  applySkip,
});

function setup(change: object | null) {
  const items = [
    item('i1', '55.00', '60.00'),
    item('i2', '55.00', '60.00'),
    item('i3', '55.00', '60.00'),
    item('i4', '55.00', '60.00', PriceChangeSkip.NOT_FOR_SALE),
  ];
  const tx = {
    priceChange: {
      findFirst: vi.fn(async () => change),
      update: vi.fn(async (..._args: unknown[]) => ({})),
    },
    priceChangeItem: { findMany: vi.fn(async () => items) },
  };
  const db = {
    $transaction: vi.fn(async (run: (client: object) => Promise<unknown>) => run(tx)),
  };
  const store = {
    loadStates: vi.fn(
      async () =>
        new Map([
          ['i1', { skip: null, current: 6000 }],
          ['i2', { skip: null, current: 6500 }],
          ['i3', { skip: PriceChangeSkip.NOT_FOR_SALE, current: null }],
          ['i4', { skip: null, current: 5500 }],
        ]),
    ),
    writePrices: vi.fn(async (..._args: unknown[]) => undefined),
    markRolledBack: vi.fn(async (..._args: unknown[]) => undefined),
  };
  const applier = {
    applyDue: vi.fn(async () => undefined),
    takeDueApplied: vi.fn(() => []),
  };
  const writer = { afterCommitDue: vi.fn(async () => undefined) };
  const cache = { invalidate: vi.fn(async () => undefined) };
  const eventEmitter = { emit: vi.fn() };
  const service = new PriceChangeLifecycleService(
    db as never,
    { lock: vi.fn(async () => undefined) } as never,
    applier as never,
    writer as never,
    store as never,
    cache as never,
    eventEmitter as never,
  );
  return { service, tx, store, cache, eventEmitter };
}

describe('PriceChangeLifecycleService.rollback of a product change', () => {
  it('returns "before" where the price still equals "after", CHANGED_AFTER and NOT_FOR_SALE otherwise', async () => {
    const { service, tx, store, cache, eventEmitter } = setup({
      id: 'ch1',
      title: 'Новые цены',
      status: PriceChangeStatus.APPLIED,
    });
    const outcome = await service.rollback(
      'loc',
      PriceChangeCatalog.PRODUCTS,
      'ch1',
      ACTOR,
    );
    expect(tx.priceChange.findFirst).toHaveBeenCalledWith({
      where: { id: 'ch1', locationId: 'loc', catalog: PriceChangeCatalog.PRODUCTS },
    });
    expect(store.writePrices.mock.calls[0][2]).toEqual([{ itemId: 'i1', price: 5500 }]);
    expect(store.markRolledBack.mock.calls[0][1]).toEqual([
      { itemId: 'i1', before: null, skip: null, rolledBack: true },
      { itemId: 'i2', before: null, skip: PriceChangeSkip.CHANGED_AFTER, rolledBack: false },
      { itemId: 'i3', before: null, skip: PriceChangeSkip.NOT_FOR_SALE, rolledBack: false },
    ]);
    expect(tx.priceChange.update.mock.calls[0][0]).toMatchObject({
      data: { status: PriceChangeStatus.ROLLED_BACK, rollbackSkippedCount: 2 },
    });
    expect(outcome.restoredCount).toBe(1);
    expect([...outcome.currents]).toEqual([
      ['i1', 6000],
      ['i2', 6500],
      ['i3', null],
    ]);
    expect(cache.invalidate).toHaveBeenCalledWith(CacheDependency.locationProducts('loc'));
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        entityType: AuditEntity.PRODUCT_PRICE_CHANGE,
        eventType: AuditEvent.PRODUCT_PRICE_CHANGE_ROLLED_BACK,
        payload: { title: 'Новые цены', restoredCount: 1, rollbackSkippedCount: 2 },
      }),
    );
  });

  it('404 PRICE_CHANGE_NOT_FOUND for a change of the other catalog or another location', async () => {
    const { service } = setup(null);
    const error = await rejectedAppException(
      service.rollback('loc', PriceChangeCatalog.PRODUCTS, 'svc-change', ACTOR),
    );
    expect(error.errorCode).toBe('PRICE_CHANGE_NOT_FOUND');
    expect(error.getStatus()).toBe(404);
  });

  it('cancel logs the product cancel event', async () => {
    const { service, tx, eventEmitter } = setup({
      id: 'ch1',
      title: '+10%',
      status: PriceChangeStatus.SCHEDULED,
      effectiveDate: new Date('2027-01-01T00:00:00Z'),
    });
    await service.cancel('loc', PriceChangeCatalog.PRODUCTS, 'ch1', ACTOR);
    expect(tx.priceChange.update.mock.calls[0][0]).toMatchObject({
      data: { status: PriceChangeStatus.CANCELLED },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        eventType: AuditEvent.PRODUCT_PRICE_CHANGE_CANCELLED,
        payload: { title: '+10%', effectiveDate: '2027-01-01' },
      }),
    );
  });
});
