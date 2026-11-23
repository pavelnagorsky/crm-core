import { cacheStoreContract } from '../testing/cache-store.contract.js';
import { MemoryCacheStore } from './memory-cache.store.js';

describe('MemoryCacheStore', () => {
  let store: MemoryCacheStore;

  beforeEach(() => {
    store = new MemoryCacheStore();
  });

  afterEach(() => {
    store.onApplicationShutdown();
    vi.useRealTimers();
  });

  cacheStoreContract(() => store);

  it('drops an expired entry on read', async () => {
    vi.useFakeTimers();
    await store.write('a', 0, [], 'v', 1_000);
    vi.advanceTimersByTime(1_000);

    expect(await store.read('a')).toEqual({ revision: 0 });
    expect(store.size).toBe(0);
  });

  describe('sweep', () => {
    it('runs on one timer that starts with the first entry', async () => {
      vi.useFakeTimers();
      expect(vi.getTimerCount()).toBe(0);

      await store.write('a', 0, [], 'v', 1_000);
      await store.write('b', 0, [], 'v', 1_000);

      expect(vi.getTimerCount()).toBe(1);
    });

    it('drops expired and invalidated entries every minute and stops when empty', async () => {
      vi.useFakeTimers();
      await store.write('short', 0, [], 'v', 1_000);
      await store.write('tagged', 0, ['dep:a'], 'v', 600_000);
      await store.write('long', 0, [], 'v', 600_000);
      await store.invalidate('dep:a');

      vi.advanceTimersByTime(60_000);
      expect(store.size).toBe(1);
      expect(await store.read('long')).toMatchObject({ payload: 'v' });

      vi.advanceTimersByTime(600_000);
      expect(store.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('stops on shutdown, more than once without failing', async () => {
      vi.useFakeTimers();
      await store.write('a', 0, [], 'v', 600_000);

      store.onApplicationShutdown();
      store.onApplicationShutdown();

      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not keep the process alive', async () => {
      await store.write('a', 0, [], 'v', 600_000);
      const timer = (store as unknown as { sweepTimer: NodeJS.Timeout })
        .sweepTimer;

      expect(timer.hasRef()).toBe(false);
    });
  });

  describe('bounds', () => {
    it('keeps at most 10 000 entries, evicting the least recently used', async () => {
      for (let i = 0; i < 10_000; i++)
        await store.write(`k${i}`, 0, [], 'v', 60_000);
      // Reading k0 makes k1 the least recently used.
      await store.read('k0');

      await store.write('new', 0, [], 'v', 60_000);

      expect(store.size).toBe(10_000);
      expect(await store.read('k1')).toEqual({ revision: 0 });
      expect(await store.read('k0')).toMatchObject({ payload: 'v' });
      expect(await store.read('new')).toMatchObject({ payload: 'v' });
    });

    it('does not evict when an entry is replaced', async () => {
      for (let i = 0; i < 10_000; i++)
        await store.write(`k${i}`, 0, [], 'v', 60_000);

      await store.write('k5', 0, [], 'v2', 60_000);

      expect(store.size).toBe(10_000);
      expect(await store.read('k0')).toMatchObject({ payload: 'v' });
    });

    it('forgets the oldest tags but keeps treating their entries as invalidated', async () => {
      await store.write('old', 0, ['dep:0'], 'v', 60_000);
      for (let i = 0; i <= 10_000; i++) await store.invalidate(`dep:${i}`);
      const { revision } = await store.read('fresh');

      // dep:0 is forgotten: an entry or a load from before its last invalidation is still stale.
      expect(await store.read('old')).toEqual({ revision });
      expect(await store.write('late', 1, ['dep:0'], 'v', 60_000)).toBe(false);
      // A load from the current revision is trusted again.
      expect(await store.write('fresh', revision, ['dep:0'], 'v', 60_000)).toBe(
        true,
      );
      expect(await store.read('fresh')).toMatchObject({ payload: 'v' });
    });

    it('keeps recent tags exact after forgetting old ones', async () => {
      for (let i = 0; i <= 10_000; i++) await store.invalidate(`dep:${i}`);
      const { revision } = await store.read('a');
      await store.write('a', revision, ['dep:10000'], 'v', 60_000);
      await store.invalidate('dep:other');

      expect(await store.read('a')).toMatchObject({ payload: 'v' });
      await store.invalidate('dep:10000');
      expect(await store.read('a')).toEqual({ revision: revision + 2 });
    });
  });
});
