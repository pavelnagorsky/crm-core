import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisService } from '../redis/redis.service.js';
import { RedisCacheStore } from './redis-cache.store.js';

/** Runs the Lua scripts against a real Redis: `REDIS_URL=redis://localhost:6379 npm run test:e2e`. */
describe.skipIf(!process.env.REDIS_URL)('RedisCacheStore (e2e)', () => {
  // A separate logical database: the test flushes it and must not touch the cache of a running app.
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  url.pathname = '/15';

  let redis: RedisService;
  let raw: Redis;
  let store: RedisCacheStore;

  const entryKey = (key: string) => `crm:cache:entry:${key}`;

  beforeAll(async () => {
    redis = new RedisService(new ConfigService({ redis: { url: url.href } }));
    await redis.onModuleInit();
    raw = new Redis(url.href);
    store = new RedisCacheStore(redis);
  });

  beforeEach(async () => {
    await raw.flushdb();
  });

  afterAll(async () => {
    await raw.flushdb();
    await raw.quit();
    await redis.onApplicationShutdown();
  });

  it('is available once connected', () => {
    expect(store.available).toBe(true);
  });

  it('misses an absent entry and reports the current revision', async () => {
    expect(await store.read('a')).toEqual({ revision: 0 });
    await store.invalidate('dep:x');
    await store.invalidate('dep:y');
    expect(await store.read('a')).toEqual({ revision: 2 });
  });

  it('writes and reads an entry with its remaining TTL', async () => {
    const payload = '{"name":"Анна\\nline","n":1}';
    expect(await store.write('a', 0, ['dep:a', 'dep:b'], payload, 60_000)).toBe(
      true,
    );

    const read = await store.read('a');
    expect(read).toMatchObject({ revision: 0, payload });
    expect(read.ttlMs).toBeGreaterThan(59_000);
    expect(read.ttlMs).toBeLessThanOrEqual(60_000);
    expect(await raw.hgetall(entryKey('a'))).toEqual({
      r: '0',
      d: 'dep:a\ndep:b',
      v: payload,
    });
  });

  it('writes an entry without dependencies', async () => {
    expect(await store.write('a', 0, [], 'v', 60_000)).toBe(true);
    await store.invalidate('dep:a');
    expect(await store.read('a')).toMatchObject({ revision: 1, payload: 'v' });
  });

  it('expires entries by TTL', async () => {
    await store.write('a', 0, ['dep:a'], 'v', 50);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await store.read('a')).toEqual({ revision: 0 });
  });

  it('keeps no TTL on the revision counter and tags', async () => {
    await store.write('a', 0, ['dep:a'], 'v', 60_000);
    await store.invalidate('dep:b');
    expect(await raw.pttl('crm:cache:rev')).toBe(-1);
    expect(await raw.pttl('crm:cache:tag:dep:b')).toBe(-1);
    expect(await raw.get('crm:cache:tag:dep:b')).toBe('1');
    expect(await raw.pttl(entryKey('a'))).toBeGreaterThan(0);
  });

  it('drops an entry whose dependency was invalidated', async () => {
    await store.write('a', 0, ['dep:a', 'dep:b'], 'v', 60_000);
    await store.invalidate('dep:b');

    expect(await store.read('a')).toEqual({ revision: 1 });
    expect(await raw.exists(entryKey('a'))).toBe(0);
  });

  it('keeps an entry when an unrelated dependency is invalidated', async () => {
    await store.write('a', 0, ['dep:a'], 'v', 60_000);
    await store.invalidate('dep:other');

    expect(await store.read('a')).toMatchObject({ revision: 1, payload: 'v' });
  });

  it('rejects a write whose load started before an invalidation', async () => {
    const { revision } = await store.read('a');
    await store.invalidate('dep:a');

    expect(await store.write('a', revision, ['dep:a'], 'old', 60_000)).toBe(
      false,
    );
    expect(await raw.exists(entryKey('a'))).toBe(0);

    const { revision: current } = await store.read('a');
    expect(await store.write('a', current, ['dep:a'], 'new', 60_000)).toBe(
      true,
    );
    expect(await store.read('a')).toMatchObject({ payload: 'new' });
  });

  it('accepts a write when only an unrelated dependency changed during the load', async () => {
    const { revision } = await store.read('a');
    await store.invalidate('dep:other');

    expect(await store.write('a', revision, ['dep:a'], 'v', 60_000)).toBe(true);
  });

  it('replaces an entry with fewer dependencies', async () => {
    await store.write('a', 0, ['dep:a', 'dep:b'], 'first', 60_000);
    await store.write('a', 0, ['dep:a'], 'second', 60_000);
    await store.invalidate('dep:b');

    expect(await store.read('a')).toMatchObject({ payload: 'second' });
  });

  it('distrusts entries newer than the counter after the counter is lost', async () => {
    await store.invalidate('dep:x');
    await store.invalidate('dep:y');
    await store.write('a', 2, ['dep:a'], 'v', 60_000);
    // Simulates a Redis restart that lost the counter but not the entry.
    await raw.del('crm:cache:rev');

    expect(await store.read('a')).toEqual({ revision: 0 });
    expect(await raw.exists(entryKey('a'))).toBe(0);
    expect(await store.write('a', 2, ['dep:a'], 'v', 60_000)).toBe(false);
  });

  it('reloads scripts after Redis forgets them', async () => {
    await store.read('a');
    await raw.script('FLUSH');

    expect(await store.read('a')).toEqual({ revision: 0 });
  });
});
