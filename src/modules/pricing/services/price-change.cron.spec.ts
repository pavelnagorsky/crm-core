import { PriceChangeCatalog } from '@prisma/client';
import { PriceChangeCron } from './price-change.cron.js';

function setup(failingId: string | null) {
  const findMany = vi
    .fn()
    .mockResolvedValueOnce([{ locationId: 'loc-a' }, { locationId: 'loc-b' }])
    .mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }])
    .mockResolvedValueOnce([{ id: 'b1' }]);
  const db = {
    priceChange: { findMany },
    $transaction: vi.fn(async (run: (tx: object) => Promise<unknown>) => run({})),
  };
  const locations = {
    getLocalesByIds: vi.fn(
      async () =>
        new Map([
          ['loc-a', { timezone: 'UTC' }],
          ['loc-b', { timezone: 'UTC' }],
        ]),
    ),
  };
  const lock = { lock: vi.fn(async () => undefined) };
  // a1 and a3 change services, a2 and b1 products: one queue per location for both catalogs.
  const catalogs: Record<string, PriceChangeCatalog> = {
    a1: PriceChangeCatalog.SERVICES,
    a2: PriceChangeCatalog.PRODUCTS,
    a3: PriceChangeCatalog.SERVICES,
    b1: PriceChangeCatalog.PRODUCTS,
  };
  const apply = vi.fn(async (_tx: object, id: string) => {
    if (id === failingId) throw new Error('db down');
    return { changeId: id, catalog: catalogs[id] };
  });
  const announce = vi.fn(async (..._args: unknown[]) => undefined);
  const cron = new PriceChangeCron(
    db as never,
    locations as never,
    lock as never,
    { apply, announce } as never,
  );
  return { cron, apply, announce, findMany };
}

describe('PriceChangeCron', () => {
  it('stops a location after its first failed change and goes on with the next location', async () => {
    const { cron, apply, announce } = setup('a2');
    await cron.applyDueChanges(new Date('2026-12-01T00:00:00Z'));
    expect(apply.mock.calls.map(([, id]) => id)).toEqual(['a1', 'a2', 'b1']);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('applies every due change in order when nothing fails', async () => {
    const { cron, apply } = setup(null);
    await cron.applyDueChanges(new Date('2026-12-01T00:00:00Z'));
    expect(apply.mock.calls.map(([, id]) => id)).toEqual(['a1', 'a2', 'a3', 'b1']);
  });

  it('applies both catalogs of a location in one queue by date, then creation', async () => {
    const { cron, announce, findMany } = setup(null);
    await cron.applyDueChanges(new Date('2026-12-01T00:00:00Z'));
    const locationQuery = findMany.mock.calls[1][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(locationQuery.where).not.toHaveProperty('catalog');
    expect(locationQuery.orderBy).toEqual([
      { effectiveDate: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    expect(
      announce.mock.calls.map(([applied]) => (applied as { catalog: string }).catalog),
    ).toEqual([
      PriceChangeCatalog.SERVICES,
      PriceChangeCatalog.PRODUCTS,
      PriceChangeCatalog.SERVICES,
      PriceChangeCatalog.PRODUCTS,
    ]);
  });
});
