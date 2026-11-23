import { StateBackend } from '../enums/state-backend.enum.js';
import { compileWithStateBackend } from '../state/testing/compile-with-state-backend.js';
import { RateLimitModule } from './rate-limit.module.js';
import { SLIDING_WINDOW_STORE } from './sliding-window-store.token.js';
import { MemorySlidingWindowStore } from './stores/memory-sliding-window.store.js';
import { RedisSlidingWindowStore } from './stores/redis-sliding-window.store.js';

describe('RateLimitModule', () => {
  afterEach(() => vi.restoreAllMocks());

  it('counts in Redis for the redis backend', async () => {
    const app = await compileWithStateBackend(
      RateLimitModule,
      StateBackend.REDIS,
    );
    expect(app.get(SLIDING_WINDOW_STORE)).toBeInstanceOf(
      RedisSlidingWindowStore,
    );
    await app.close();
  });

  it('counts in memory for the memory backend', async () => {
    const app = await compileWithStateBackend(
      RateLimitModule,
      StateBackend.MEMORY,
    );
    const store = app.get<MemorySlidingWindowStore>(SLIDING_WINDOW_STORE);
    expect(store).toBeInstanceOf(MemorySlidingWindowStore);
    expect(await store.tryAcquire('k', 1, 60_000)).toBe(true);
    expect(await store.tryAcquire('k', 1, 60_000)).toBe(false);
    await app.close();
  });
});
