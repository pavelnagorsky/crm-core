import { cronLockStoreContract } from '../testing/cron-lock-store.contract.js';
import { MemoryCronLockStore } from './memory-cron-lock.store.js';

describe('MemoryCronLockStore', () => {
  let store: MemoryCronLockStore;

  beforeEach(() => {
    store = new MemoryCronLockStore();
  });

  afterEach(() => vi.useRealTimers());

  cronLockStoreContract(() => store);

  it('holds a slot for an hour and then forgets it', async () => {
    vi.useFakeTimers();
    await store.tryAcquire('Jobs.run', 1);

    vi.advanceTimersByTime(3600 * 1000 - 1);
    expect(await store.tryAcquire('Jobs.run', 1)).toBe(false);

    vi.advanceTimersByTime(1);
    expect(await store.tryAcquire('Jobs.run', 1)).toBe(true);
  });

  it('drops expired slots on the next claim', async () => {
    vi.useFakeTimers();
    for (let slot = 0; slot < 60; slot++)
      await store.tryAcquire('Jobs.run', slot);
    expect(store.size).toBe(60);

    vi.advanceTimersByTime(3600 * 1000);
    await store.tryAcquire('Jobs.run', 60);

    expect(store.size).toBe(1);
  });
});
