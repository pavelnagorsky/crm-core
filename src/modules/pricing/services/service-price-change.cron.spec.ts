import { ServicePriceChangeCron } from './service-price-change.cron.js';

function setup(failingId: string | null) {
  const findMany = vi
    .fn()
    .mockResolvedValueOnce([{ locationId: 'loc-a' }, { locationId: 'loc-b' }])
    .mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }])
    .mockResolvedValueOnce([{ id: 'b1' }]);
  const db = {
    servicePriceChange: { findMany },
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
  const apply = vi.fn(async (_tx: object, id: string) => {
    if (id === failingId) throw new Error('db down');
    return { changeId: id };
  });
  const announce = vi.fn(async () => undefined);
  const cron = new ServicePriceChangeCron(
    db as never,
    locations as never,
    lock as never,
    { apply, announce } as never,
  );
  return { cron, apply, announce };
}

describe('ServicePriceChangeCron', () => {
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
});
