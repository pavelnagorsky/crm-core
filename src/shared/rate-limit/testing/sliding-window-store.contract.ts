import { SlidingWindowStore } from '../interfaces/sliding-window-store.interface.js';

const WINDOW_MS = 10 * 60 * 1000;
const NOW = 1_800_000_000_000;

/**
 * Behaviour every SlidingWindowStore adapter must have, run against `MemorySlidingWindowStore` in unit tests and
 * against `RedisSlidingWindowStore` in e2e tests. `store` returns an empty store for each test.
 * Only `Date` is faked: the Redis client keeps its real timers.
 */
export function slidingWindowStoreContract(
  store: () => SlidingWindowStore,
): void {
  describe('SlidingWindowStore contract', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('allows attempts up to the limit and rejects the next one', async () => {
      for (let i = 0; i < 10; i++)
        expect(await store().tryAcquire('k', 10, WINDOW_MS)).toBe(true);

      expect(await store().tryAcquire('k', 10, WINDOW_MS)).toBe(false);
    });

    it('does not record a rejected attempt', async () => {
      expect(await store().tryAcquire('k', 1, WINDOW_MS)).toBe(true);
      vi.setSystemTime(NOW + WINDOW_MS - 1);
      expect(await store().tryAcquire('k', 1, WINDOW_MS)).toBe(false);

      // Only the first attempt counted, so the window frees up once it leaves.
      vi.setSystemTime(NOW + WINDOW_MS);
      expect(await store().tryAcquire('k', 1, WINDOW_MS)).toBe(true);
    });

    it('slides the window: an attempt exactly one window old no longer counts', async () => {
      expect(await store().tryAcquire('k', 2, WINDOW_MS)).toBe(true);
      vi.setSystemTime(NOW + 1);
      expect(await store().tryAcquire('k', 2, WINDOW_MS)).toBe(true);
      vi.setSystemTime(NOW + WINDOW_MS - 1);
      expect(await store().tryAcquire('k', 2, WINDOW_MS)).toBe(false);
      vi.setSystemTime(NOW + WINDOW_MS);
      expect(await store().tryAcquire('k', 2, WINDOW_MS)).toBe(true);
      // The attempt at NOW + 1 is still in the window together with the last one.
      expect(await store().tryAcquire('k', 2, WINDOW_MS)).toBe(false);
    });

    it('counts attempts in the same millisecond separately', async () => {
      expect(await store().tryAcquire('k', 2, WINDOW_MS)).toBe(true);
      expect(await store().tryAcquire('k', 2, WINDOW_MS)).toBe(true);
      expect(await store().tryAcquire('k', 2, WINDOW_MS)).toBe(false);
    });

    it('counts keys separately', async () => {
      expect(await store().tryAcquire('a', 1, WINDOW_MS)).toBe(true);
      expect(await store().tryAcquire('a', 1, WINDOW_MS)).toBe(false);
      expect(await store().tryAcquire('b', 1, WINDOW_MS)).toBe(true);
    });
  });
}
