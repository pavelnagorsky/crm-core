import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisService } from '../../redis/redis.service.js';
import { throttlerStorageContract } from '../testing/throttler-storage.contract.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

/** Runs the Lua script against a real Redis: `REDIS_URL=redis://localhost:6379 npm run test:e2e`. */
describe.skipIf(!process.env.REDIS_URL)('RedisThrottlerStorage (e2e)', () => {
  // Own logical database: the test flushes it, and e2e files run in parallel (the cache spec uses 15).
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  url.pathname = '/14';

  let redis: RedisService;
  let raw: Redis;
  let storage: RedisThrottlerStorage;

  beforeAll(async () => {
    redis = new RedisService(new ConfigService({ redis: { url: url.href } }));
    await redis.onModuleInit();
    raw = new Redis(url.href);
    storage = new RedisThrottlerStorage(redis);
  });

  beforeEach(async () => {
    await raw.flushdb();
  });

  afterAll(async () => {
    await raw.flushdb();
    await raw.quit();
    await redis.onApplicationShutdown();
  });

  throttlerStorageContract(() => storage);

  it('keeps hits under crm:throttle:<name>:<key>, each scored by its expiry, with the ttl as key TTL', async () => {
    const before = Date.now();
    await storage.increment('ip', 60_000, 3, 60_000, 'n');
    await storage.increment('ip', 60_000, 3, 60_000, 'n');

    const hits = await raw.zrange('crm:throttle:n:ip', '0', '-1', 'WITHSCORES');
    expect(hits).toHaveLength(4);
    expect(Number(hits[1])).toBeGreaterThanOrEqual(before + 60_000);
    expect(Number(hits[3])).toBeLessThanOrEqual(Date.now() + 60_000);
    const pttl = await raw.pttl('crm:throttle:n:ip');
    expect(pttl).toBeGreaterThan(59_000);
    expect(pttl).toBeLessThanOrEqual(60_000);
  });

  it('replaces the hit counter with a block key when blocking', async () => {
    for (let i = 0; i < 4; i++)
      await storage.increment('ip', 1_000, 3, 10_000, 'burst');

    expect(await raw.exists('crm:throttle:burst:ip')).toBe(0);
    expect(await raw.get('crm:throttle:burst:ip:block')).toBe('4');
  });

  it('without a block duration sets no block key and does not count the rejected hit', async () => {
    for (let i = 0; i < 3; i++)
      await storage.increment('ip', 60_000, 2, 0, 'n');

    expect(await raw.zcard('crm:throttle:n:ip')).toBe(2);
    expect(await raw.exists('crm:throttle:n:ip:block')).toBe(0);
  });
});
