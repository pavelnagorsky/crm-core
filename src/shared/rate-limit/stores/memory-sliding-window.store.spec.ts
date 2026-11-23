import { slidingWindowStoreContract } from '../testing/sliding-window-store.contract.js';
import { MemorySlidingWindowStore } from './memory-sliding-window.store.js';

const WINDOW_MS = 10 * 60 * 1000;

describe('MemorySlidingWindowStore', () => {
  let store: MemorySlidingWindowStore;

  beforeEach(() => {
    store = new MemorySlidingWindowStore();
  });

  afterEach(() => {
    store.onApplicationShutdown();
    vi.useRealTimers();
  });

  slidingWindowStoreContract(() => store);

  it('creates no key for a rejected attempt', async () => {
    expect(await store.tryAcquire('k', 0, WINDOW_MS)).toBe(false);
    expect(store.size).toBe(0);
  });

  it('keeps at most the limit of attempts per key', async () => {
    for (let i = 0; i < 50; i++) await store.tryAcquire('k', 3, WINDOW_MS);
    const window = (
      store as unknown as { windows: Map<string, { attempts: number[] }> }
    ).windows.get('k');

    expect(window?.attempts).toHaveLength(3);
  });

  describe('sweep', () => {
    it('runs on one unref timer that starts with the first key', async () => {
      vi.useFakeTimers();
      expect(vi.getTimerCount()).toBe(0);

      await store.tryAcquire('a', 5, WINDOW_MS);
      await store.tryAcquire('b', 5, WINDOW_MS);

      expect(vi.getTimerCount()).toBe(1);
    });

    it('drops keys whose window has passed and stops when none are left', async () => {
      vi.useFakeTimers();
      await store.tryAcquire('short', 5, 30_000);
      await store.tryAcquire('long', 5, WINDOW_MS);

      vi.advanceTimersByTime(60_000);
      expect(store.size).toBe(1);

      vi.advanceTimersByTime(WINDOW_MS);
      expect(store.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('stops on shutdown, more than once without failing', async () => {
      vi.useFakeTimers();
      await store.tryAcquire('a', 5, WINDOW_MS);

      store.onApplicationShutdown();
      store.onApplicationShutdown();

      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not keep the process alive', async () => {
      await store.tryAcquire('a', 5, WINDOW_MS);
      const timer = (store as unknown as { sweepTimer: NodeJS.Timeout })
        .sweepTimer;

      expect(timer.hasRef()).toBe(false);
    });
  });

  it('keeps at most 100 000 keys, evicting the one with the oldest attempt', async () => {
    for (let i = 0; i < 100_000; i++)
      await store.tryAcquire(`k${i}`, 1, WINDOW_MS);
    // A second recorded attempt on k0 (limit 2) moves it to the end, so k1 holds the oldest attempt.
    expect(await store.tryAcquire('k0', 2, WINDOW_MS)).toBe(true);

    await store.tryAcquire('new', 1, WINDOW_MS);

    expect(store.size).toBe(100_000);
    expect(await store.tryAcquire('k1', 1, WINDOW_MS)).toBe(true);
    expect(await store.tryAcquire('new', 1, WINDOW_MS)).toBe(false);
  });
});
