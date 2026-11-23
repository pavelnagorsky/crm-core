import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisService } from '../../redis/redis.service.js';
import { cacheStoreContract } from '../testing/cache-store.contract.js';
import { RedisCacheStore } from './redis-cache.store.js';

/** Runs the Lua scripts against a real Redis: `REDIS_URL=redis://localhost:6379 npm run test:e2e`. */
describe.skipIf(!process.env.REDIS_URL)('RedisCacheStore (e2e)', () => {
  // A separate logical database: the test flushes it and must not touch the cache of a running app.
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  url.pathname = '/15';

  let redis: RedisService;
  let raw: Redis;
  let store: RedisCacheStore;

  const entryKey = (key: string) => `klendo:cache:entry:${key}`;

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

  cacheStoreContract(() => store);

  it('stores an entry as a hash of revision, dependencies and payload', async () => {
    const payload = '{"name":"Анна\\nline","n":1}';
    await store.write('a', 0, ['dep:a', 'dep:b'], payload, 60_000);

    expect(await raw.hgetall(entryKey('a'))).toEqual({
      r: '0',
      d: 'dep:a\ndep:b',
      v: payload,
    });
  });

  it('keeps no TTL on the revision counter and tags', async () => {
    await store.write('a', 0, ['dep:a'], 'v', 60_000);
    await store.invalidate('dep:b');
    expect(await raw.pttl('klendo:cache:rev')).toBe(-1);
    expect(await raw.pttl('klendo:cache:tag:dep:b')).toBe(-1);
    expect(await raw.get('klendo:cache:tag:dep:b')).toBe('1');
    expect(await raw.pttl(entryKey('a'))).toBeGreaterThan(0);
  });

  it('deletes an entry whose dependency was invalidated', async () => {
    await store.write('a', 0, ['dep:a', 'dep:b'], 'v', 60_000);
    await store.invalidate('dep:b');

    expect(await store.read('a')).toEqual({ revision: 1 });
    expect(await raw.exists(entryKey('a'))).toBe(0);
  });

  it('does not create an entry for a rejected write', async () => {
    const { revision } = await store.read('a');
    await store.invalidate('dep:a');

    expect(await store.write('a', revision, ['dep:a'], 'old', 60_000)).toBe(
      false,
    );
    expect(await raw.exists(entryKey('a'))).toBe(0);
  });

  it('distrusts entries newer than the counter after the counter is lost', async () => {
    await store.invalidate('dep:x');
    await store.invalidate('dep:y');
    await store.write('a', 2, ['dep:a'], 'v', 60_000);
    // Simulates a Redis restart that lost the counter but not the entry.
    await raw.del('klendo:cache:rev');

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
