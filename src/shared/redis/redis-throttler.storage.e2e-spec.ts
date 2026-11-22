import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';
import { RedisService } from './redis.service.js';

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

  it('counts hits in a window with a TTL in seconds', async () => {
    expect(await storage.increment('ip', 60_000, 3, 60_000, 'n')).toEqual({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(
      (await storage.increment('ip', 60_000, 3, 60_000, 'n')).totalHits,
    ).toBe(2);
    expect(await raw.get('crm:throttle:n:ip')).toBe('2');
    const pttl = await raw.pttl('crm:throttle:n:ip');
    expect(pttl).toBeGreaterThan(59_000);
    expect(pttl).toBeLessThanOrEqual(60_000);
  });

  it('blocks the hit over the limit for the block duration and stops counting', async () => {
    for (let i = 0; i < 3; i++)
      await storage.increment('ip', 1_000, 3, 10_000, 'burst');

    expect(await storage.increment('ip', 1_000, 3, 10_000, 'burst')).toEqual({
      totalHits: 4,
      timeToExpire: 1,
      isBlocked: true,
      timeToBlockExpire: 10,
    });
    const blocked = await storage.increment('ip', 1_000, 3, 10_000, 'burst');
    expect(blocked).toMatchObject({ totalHits: 4, isBlocked: true });
    expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
    expect(blocked.timeToBlockExpire).toBeLessThanOrEqual(10);
    expect(await raw.exists('crm:throttle:burst:ip')).toBe(0);
  });

  it('restarts the count after the block ends', async () => {
    for (let i = 0; i < 3; i++)
      await storage.increment('ip', 60_000, 2, 100, 'n');
    expect((await storage.increment('ip', 60_000, 2, 100, 'n')).isBlocked).toBe(
      true,
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(await storage.increment('ip', 60_000, 2, 100, 'n')).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });

  it('without a block duration rejects the hit over the limit and does not count it', async () => {
    for (let i = 0; i < 2; i++)
      await storage.increment('ip', 60_000, 2, 0, 'n');

    const rejected = await storage.increment('ip', 60_000, 2, 0, 'n');
    expect(rejected).toMatchObject({ totalHits: 3, isBlocked: true });
    expect(rejected.timeToBlockExpire).toBe(60);
    expect(await raw.get('crm:throttle:n:ip')).toBe('2');
    expect(await raw.exists('crm:throttle:n:ip:block')).toBe(0);
  });

  it('keeps keys of different throttlers apart', async () => {
    await storage.increment('ip', 60_000, 5, 0, 'a');
    await storage.increment('ip', 60_000, 5, 0, 'a');
    expect((await storage.increment('ip', 60_000, 5, 0, 'b')).totalHits).toBe(
      1,
    );
  });
});
