import { StateBackend } from '../enums/state-backend.enum.js';
import { compileWithStateBackend } from '../state/testing/compile-with-state-backend.js';
import { AppCacheModule } from './app-cache.module.js';
import { AppCacheService } from './app-cache.service.js';
import { CACHE_STORE } from './cache-store.token.js';
import { defineCache } from './define-cache.js';
import { CacheNamespace } from './enums/cache-namespace.enum.js';
import { MemoryCacheStore } from './stores/memory-cache.store.js';
import { RedisCacheStore } from './stores/redis-cache.store.js';

describe('AppCacheModule', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stores the cache in Redis for the redis backend', async () => {
    const app = await compileWithStateBackend(
      AppCacheModule,
      StateBackend.REDIS,
    );
    expect(app.get(CACHE_STORE, { strict: false })).toBeInstanceOf(
      RedisCacheStore,
    );
    await app.close();
  });

  it('stores the cache in memory for the memory backend, and it caches', async () => {
    const app = await compileWithStateBackend(
      AppCacheModule,
      StateBackend.MEMORY,
    );
    expect(app.get(CACHE_STORE, { strict: false })).toBeInstanceOf(
      MemoryCacheStore,
    );

    const cache = app.get(AppCacheService);
    const loader = vi.fn(async () => ({ name: 'Анна' }));
    const definition = defineCache<string, { name: string }>({
      namespace: CacheNamespace.BRAND_PROFILE,
      identity: (id) => [id],
      dependencies: (id) => [`brand:${id}`],
      policy: { ttlMs: 60_000, refreshAheadMs: 0 },
    });
    await cache.getOrLoad(definition, 'a', loader);
    await expect(cache.getOrLoad(definition, 'a', loader)).resolves.toEqual({
      name: 'Анна',
    });
    expect(loader).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
