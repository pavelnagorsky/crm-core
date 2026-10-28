import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createCache } from 'cache-manager';
import { AppCacheService } from './app-cache.service.js';
import { cacheKey } from './cache-key.js';
import { defineCache } from './define-cache.js';
import { CacheNamespace } from './enums/cache-namespace.enum.js';
import { createTestCache } from './testing/create-test-cache.js';

const definition = defineCache<{ id: string }, { name: string }>({
  namespace: CacheNamespace.BRAND_PROFILE,
  identity: ({ id }) => [id],
  dependencies: ({ id }) => [`brand:${id}`],
  policy: {
    ttlMs: 1000,
    refreshAheadMs: 200,
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('AppCacheService', () => {
  let cache: AppCacheService;
  let manager: ReturnType<typeof createCache>;
  beforeEach(() => {
    manager = createCache();
    cache = new AppCacheService(manager, new ConfigService());
  });
  afterEach(async () => {
    await cache.onModuleDestroy();
    vi.useRealTimers();
  });

  it('isolates tenants and caller mutations and combines concurrent loads', async () => {
    const loader = vi.fn().mockResolvedValue({ name: 'original' });
    const [a, b] = await Promise.all([
      cache.getOrLoad(definition, { id: 'a' }, loader),
      cache.getOrLoad(definition, { id: 'a' }, loader),
    ]);
    a.name = 'changed';
    expect(b.name).toBe('original');
    expect(loader).toHaveBeenCalledTimes(1);
    expect((await cache.getOrLoad(definition, { id: 'a' }, loader)).name).toBe(
      'original',
    );
    await cache.getOrLoad(definition, { id: 'b' }, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not return or retain a load invalidated while the database was pending', async () => {
    const old = deferred<{ name: string }>();
    const fresh = deferred<{ name: string }>();
    const loader = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const first = cache.getOrLoad(definition, { id: 'a' }, loader);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await cache.invalidate('brand:a');
    const second = cache.getOrLoad(definition, { id: 'a' }, loader);
    await Promise.resolve();
    old.resolve({ name: 'old' });
    fresh.resolve({ name: 'new' });
    expect(await first).toEqual({ name: 'new' });
    expect(await second).toEqual({ name: 'new' });
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'new',
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('detects parent invalidation before the loader discovers the parent ID', async () => {
    const child = {
      ...definition,
      dependencies: (_: { id: string }, value?: { name: string }) =>
        value ? [`parent:${value.name}`] : [],
    };
    const pending = deferred<{ name: string }>();
    const loader = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ name: 'current' });
    const result = cache.getOrLoad(child, { id: 'a' }, loader);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await cache.invalidate('parent:deleted');
    pending.resolve({ name: 'deleted' });
    expect(await result).toEqual({ name: 'current' });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('reloads once, then reads without caching when writes keep invalidating loads', async () => {
    let loads = 0;
    const loader = vi.fn(async () => {
      loads++;
      if (loads <= 2) await cache.invalidate('brand:a');
      return { name: `value-${loads}` };
    });

    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'value-3',
    });
    expect(loader).toHaveBeenCalledTimes(3);

    // The uncached read must not become a shared value after another writer runs.
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'value-4',
    });
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'value-4',
    });
    expect(loader).toHaveBeenCalledTimes(4);
  });

  it('does not retry a database error while reloading an invalidated value', async () => {
    const loader = vi.fn().mockResolvedValue({ name: 'original' });
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    await cache.invalidate('brand:a');
    loader.mockRejectedValue(new Error('database unavailable'));

    await expect(
      cache.getOrLoad(definition, { id: 'a' }, loader),
    ).rejects.toThrow('database unavailable');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('rejects an old load even when invalidation happens between loading and the memory write', async () => {
    await cache.onModuleDestroy();
    const manager = createCache();
    const store = manager.stores[0];
    cache = new AppCacheService(manager, new ConfigService());
    const gate = deferred<void>();
    const serialize = store.serializeData.bind(store);
    const serializing = vi
      .spyOn(store, 'serializeData')
      .mockImplementationOnce(async (data) => {
        await gate.promise;
        return serialize(data);
      });
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ name: 'old' })
      .mockResolvedValue({ name: 'new' });
    const read = cache.getOrLoad(definition, { id: 'a' }, loader);
    await vi.waitFor(() => expect(serializing).toHaveBeenCalledTimes(1));
    await cache.invalidate('brand:a');
    gate.resolve();
    expect(await read).toEqual({ name: 'new' });
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'new',
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not serve a stale background refresh after a domain write', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const old = deferred<{ name: string }>();
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ name: 'original' })
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ name: 'changed' });
    try {
      await cache.getOrLoad(definition, { id: 'a' }, loader);
      now.mockReturnValue(10_850);
      await cache.getOrLoad(definition, { id: 'a' }, loader);
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
      await cache.invalidate('brand:a');
      expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
        name: 'changed',
      });
      old.resolve({ name: 'stale refresh' });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
        name: 'changed',
      });
    } finally {
      now.mockRestore();
    }
  });

  it('keeps unrelated cached entities after invalidation', async () => {
    const loader = vi.fn().mockResolvedValue({ name: 'unchanged' });
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    await cache.getOrLoad(definition, { id: 'b' }, loader);
    await cache.invalidate('brand:a');
    expect(await cache.getOrLoad(definition, { id: 'b' }, loader)).toEqual({
      name: 'unchanged',
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('expires values and retries failed loaders without negative caching', async () => {
    vi.useFakeTimers();
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ name: 'ok' });
    await expect(
      cache.getOrLoad(definition, { id: 'a' }, loader),
    ).rejects.toThrow('offline');
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    vi.advanceTimersByTime(1001);
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('returns a valid value while a request refreshes it before TTL', async () => {
    vi.useFakeTimers();
    const pending = deferred<{ name: string }>();
    const refreshed = deferred<void>();
    manager.on('refresh', () => refreshed.resolve());
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ name: 'old' })
      .mockReturnValueOnce(pending.promise);

    await cache.getOrLoad(definition, { id: 'a' }, loader);
    await vi.advanceTimersByTimeAsync(850);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'old',
    });
    expect(loader).toHaveBeenCalledTimes(2);

    pending.resolve({ name: 'new' });
    await refreshed.promise;
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'new',
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('keeps a valid value after refresh failure and reloads it after TTL', async () => {
    vi.useFakeTimers();
    const failed = deferred<unknown>();
    manager.on('refresh', ({ error }) => failed.resolve(error));
    const error = new Error('offline');
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ name: 'old' })
      .mockRejectedValueOnce(error)
      .mockResolvedValue({ name: 'new' });
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    vi.advanceTimersByTime(850);
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'old',
    });
    expect(await failed.promise).toBe(error);
    expect(
      await manager.get(cacheKey(definition.namespace, ['a'])),
    ).toMatchObject({
      value: { name: 'old' },
    });
    expect(loader).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(151);
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'new',
    });
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('leaves unused entries expired until the next request', async () => {
    vi.useFakeTimers();
    const loader = vi.fn().mockResolvedValue({ name: 'current' });
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(loader).toHaveBeenCalledTimes(1);
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('retains Date and Decimal semantics without sharing objects', async () => {
    const rich = defineCache<
      { id: string },
      { date: Date; price: Prisma.Decimal }
    >({
      ...definition,
      isUsable: undefined,
      dependencies: () => [],
    });
    const loader = async () => ({
      date: new Date('2026-01-01'),
      price: new Prisma.Decimal('12.30'),
    });
    const a = await cache.getOrLoad(rich, { id: 'a' }, loader);
    a.date.setFullYear(2000);
    const b = await cache.getOrLoad(rich, { id: 'a' }, loader);
    expect(b.date.getUTCFullYear()).toBe(2026);
    expect(b.price.plus(1).toFixed(2)).toBe('13.30');
  });

  it('shares concurrent request loads after invalidation', async () => {
    vi.useFakeTimers();
    const loader = vi.fn().mockResolvedValue({ name: 'old' });
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    const pending = deferred<{ name: string }>();
    loader.mockReturnValue(pending.promise);
    await cache.invalidate('brand:a');
    await vi.advanceTimersByTimeAsync(100);
    expect(loader).toHaveBeenCalledTimes(1);
    const first = cache.getOrLoad(definition, { id: 'a' }, loader);
    const second = cache.getOrLoad(definition, { id: 'a' }, loader);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    pending.resolve({ name: 'new' });
    expect(await Promise.all([first, second])).toEqual([
      { name: 'new' },
      { name: 'new' },
    ]);
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'new',
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('bypasses caching when disabled', async () => {
    vi.useFakeTimers();
    await cache.onModuleDestroy();
    cache = createTestCache(false);
    const loader = vi.fn().mockResolvedValue({ name: 'current' });
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    await cache.invalidate('brand:a');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(loader).toHaveBeenCalledTimes(1);
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('retains entity datasets without arbitrary count or size cutoffs', async () => {
    const large = { name: 'a'.repeat(600_000) };
    const loader = vi.fn().mockResolvedValue(large);
    for (let i = 0; i < 130; i++) {
      await cache.getOrLoad(definition, { id: String(i) }, async () => ({
        name: String(i),
      }));
    }
    await cache.getOrLoad(definition, { id: 'large' }, loader);
    expect(await cache.getOrLoad(definition, { id: '0' }, loader)).toEqual({
      name: '0',
    });
    expect(await cache.getOrLoad(definition, { id: 'large' }, loader)).toEqual(
      large,
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not restart an unrelated pending load after invalidation', async () => {
    const pending = deferred<{ name: string }>();
    const loader = vi.fn().mockReturnValue(pending.promise);
    const read = cache.getOrLoad(definition, { id: 'a' }, loader);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await cache.invalidate('brand:b');
    pending.resolve({ name: 'unchanged' });
    expect(await read).toEqual({ name: 'unchanged' });
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'unchanged',
    });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('escapes identity separators without key collisions', () => {
    expect(cacheKey(CacheNamespace.BRAND_PROFILE, ['a:b', 'c'])).not.toBe(
      cacheKey(CacheNamespace.BRAND_PROFILE, ['a', 'b:c']),
    );
  });

  it('uses unique namespace identifiers', () => {
    const namespaces = Object.values(CacheNamespace);
    expect(new Set(namespaces).size).toBe(namespaces.length);
  });
});
