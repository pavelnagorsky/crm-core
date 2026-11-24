import { Prisma } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../metrics/metrics.service.js';
import { metricValue } from '../metrics/testing/metric-value.js';
import { AppCacheMetrics } from './app-cache.metrics.js';
import { AppCacheService } from './app-cache.service.js';
import { cacheKey } from './cache-key.js';
import { CacheValueCodec } from './cache-value.codec.js';
import { defineCache } from './define-cache.js';
import { CacheNamespace } from './enums/cache-namespace.enum.js';
import { createTestCache } from './testing/create-test-cache.js';
import { MemoryCacheStore } from './stores/memory-cache.store.js';

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
  let store: MemoryCacheStore;
  let metrics: MetricsService;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    store = new MemoryCacheStore();
    metrics = new MetricsService();
    cache = new AppCacheService(
      store,
      new ConfigService(),
      new AppCacheMetrics(metrics),
    );
  });
  afterEach(() => {
    cache.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const storedValue = async (id: string) => {
    const { payload } = await store.read(cacheKey(definition.namespace, [id]));
    return payload === undefined ? undefined : CacheValueCodec.decode(payload);
  };

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
    // The second request must not join the load that started before the invalidation.
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
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

  it('rejects an old load even when invalidation happens between loading and the store write', async () => {
    const gate = deferred<void>();
    const write = store.write.bind(store);
    const writing = vi
      .spyOn(store, 'write')
      .mockImplementationOnce(async (...args) => {
        await gate.promise;
        return write(...args);
      });
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ name: 'old' })
      .mockResolvedValue({ name: 'new' });
    const read = cache.getOrLoad(definition, { id: 'a' }, loader);
    await vi.waitFor(() => expect(writing).toHaveBeenCalledTimes(1));
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
    const write = vi.spyOn(store, 'write');
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
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(await write.mock.results[1].value).toBe(true);
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'new',
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('keeps a valid value after refresh failure and reloads it after TTL', async () => {
    vi.useFakeTimers();
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ name: 'old' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ name: 'new' });
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    vi.advanceTimersByTime(850);
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'old',
    });
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        `Cache refresh failed: ${cacheKey(definition.namespace, ['a'])}: Error: offline`,
      ),
    );
    expect(await storedValue('a')).toEqual({ name: 'old' });
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
    const [a, b] = await Promise.all([first, second]);
    expect([a, b]).toEqual([{ name: 'new' }, { name: 'new' }]);
    expect(a).not.toBe(b);
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'new',
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('bypasses caching when disabled', async () => {
    vi.useFakeTimers();
    cache.onModuleDestroy();
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

  it('reloads a cached value that the definition no longer accepts', async () => {
    let accepted = 'v1';
    const versioned = defineCache<{ id: string }, { name: string }>({
      ...definition,
      isUsable: (value) => value.name === accepted,
    });
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ name: 'v1' })
      .mockResolvedValue({ name: 'v2' });
    await cache.getOrLoad(versioned, { id: 'a' }, loader);
    expect(await cache.getOrLoad(versioned, { id: 'a' }, loader)).toEqual({
      name: 'v1',
    });
    accepted = 'v2';
    expect(await cache.getOrLoad(versioned, { id: 'a' }, loader)).toEqual({
      name: 'v2',
    });
    expect(await cache.getOrLoad(versioned, { id: 'a' }, loader)).toEqual({
      name: 'v2',
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('stops background refreshes on shutdown but keeps the shared entries', async () => {
    vi.useFakeTimers();
    const loader = vi.fn().mockResolvedValue({ name: 'current' });
    await cache.getOrLoad(definition, { id: 'a' }, loader);
    cache.onModuleDestroy();
    vi.advanceTimersByTime(850);
    expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
      name: 'current',
    });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(await storedValue('a')).toEqual({ name: 'current' });
  });

  describe('when the store fails (fail-open)', () => {
    it('loads without the store while it is unavailable', async () => {
      vi.spyOn(store, 'available', 'get').mockReturnValue(false);
      const read = vi.spyOn(store, 'read');
      const invalidate = vi.spyOn(store, 'invalidate');
      const loader = vi.fn().mockResolvedValue({ name: 'current' });

      await cache.getOrLoad(definition, { id: 'a' }, loader);
      await cache.getOrLoad(definition, { id: 'a' }, loader);
      await expect(cache.invalidate('brand:a')).resolves.toBeUndefined();

      expect(loader).toHaveBeenCalledTimes(2);
      expect(read).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('loads from the database when a read fails and warns at most once a minute', async () => {
      vi.useFakeTimers();
      vi.spyOn(store, 'read').mockRejectedValue(new Error('Command timed out'));
      const loader = vi.fn().mockResolvedValue({ name: 'current' });

      expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
        name: 'current',
      });
      await cache.getOrLoad(definition, { id: 'a' }, loader);
      expect(loader).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('Command timed out');

      vi.advanceTimersByTime(60_000);
      await cache.getOrLoad(definition, { id: 'a' }, loader);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('returns the loaded value when the write fails', async () => {
      vi.spyOn(store, 'write').mockRejectedValue(new Error('OOM'));
      const loader = vi.fn().mockResolvedValue({ name: 'current' });

      expect(await cache.getOrLoad(definition, { id: 'a' }, loader)).toEqual({
        name: 'current',
      });
      expect(loader).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('logs a failed invalidation without failing the committed write', async () => {
      vi.spyOn(store, 'invalidate').mockRejectedValue(
        new Error('Connection is closed.'),
      );

      await expect(cache.invalidate('brand:a')).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0][0]).toContain('brand:a');
    });

    it('loads uncached when the store fails while reloading an invalidated load', async () => {
      const pending = deferred<{ name: string }>();
      const loader = vi
        .fn()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue({ name: 'new' });
      const result = cache.getOrLoad(definition, { id: 'a' }, loader);
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
      await cache.invalidate('brand:a');
      vi.spyOn(store, 'read').mockRejectedValue(new Error('Command timed out'));
      pending.resolve({ name: 'old' });

      expect(await result).toEqual({ name: 'new' });
      expect(loader).toHaveBeenCalledTimes(2);
    });
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

  describe('metrics', () => {
    const reads = (result: string) =>
      metricValue(metrics.registry, 'klendo_cache_reads_total', {
        namespace: CacheNamespace.BRAND_PROFILE,
        result,
      });
    const load = async () => ({ name: 'Acme' });

    it('counts a miss, then hits', async () => {
      await cache.getOrLoad(definition, { id: '1' }, load);
      await cache.getOrLoad(definition, { id: '1' }, load);
      await cache.getOrLoad(definition, { id: '1' }, load);

      expect(await reads('miss')).toBe(1);
      expect(await reads('hit')).toBe(2);
    });

    it('counts reads that skip an unavailable store', async () => {
      vi.spyOn(store, 'available', 'get').mockReturnValue(false);

      await cache.getOrLoad(definition, { id: '1' }, load);

      expect(await reads('bypass')).toBe(1);
      expect(await reads('miss')).toBeUndefined();
    });

    it('counts failed store reads', async () => {
      vi.spyOn(store, 'read').mockRejectedValue(new Error('Command timed out'));

      await cache.getOrLoad(definition, { id: '1' }, load);

      expect(await reads('error')).toBe(1);
    });

    it('counts nothing while the cache is disabled', async () => {
      const own = new MetricsService();
      const disabled = new AppCacheService(
        store,
        new ConfigService({ cache: { enabled: false } }),
        new AppCacheMetrics(own),
      );

      await disabled.getOrLoad(definition, { id: '1' }, load);

      expect(
        await metricValue(own.registry, 'klendo_cache_reads_total'),
      ).toBeUndefined();
    });
  });
});
