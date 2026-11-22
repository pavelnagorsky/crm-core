import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisService } from '../../redis/redis.service.js';
import { slidingWindowStoreContract } from '../testing/sliding-window-store.contract.js';
import { RedisSlidingWindowStore } from './redis-sliding-window.store.js';

const WINDOW_MS = 10 * 60 * 1000;

/** Runs the Lua script against a real Redis: `REDIS_URL=redis://localhost:6379 npm run test:e2e`. */
describe.skipIf(!process.env.REDIS_URL)('RedisSlidingWindowStore (e2e)', () => {
  // Own logical database: the test flushes it, and e2e files run in parallel (the cache spec uses 15).
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  url.pathname = '/13';

  let redis: RedisService;
  let raw: Redis;
  let store: RedisSlidingWindowStore;

  beforeAll(async () => {
    redis = new RedisService(new ConfigService({ redis: { url: url.href } }));
    await redis.onModuleInit();
    raw = new Redis(url.href);
    store = new RedisSlidingWindowStore(redis);
  });

  beforeEach(async () => {
    await raw.flushdb();
  });

  afterAll(async () => {
    await raw.flushdb();
    await raw.quit();
    await redis.onApplicationShutdown();
  });

  slidingWindowStoreContract(() => store);

  it('keeps the allowed attempts in a sorted set under crm:<key> with the window as TTL', async () => {
    const key = 'booking-rate:phone:+375291112233';
    for (let i = 0; i < 10; i++)
      expect(await store.tryAcquire(key, 10, WINDOW_MS)).toBe(true);

    expect(await store.tryAcquire(key, 10, WINDOW_MS)).toBe(false);
    expect(await raw.zcard(`crm:${key}`)).toBe(10);
    const pttl = await raw.pttl(`crm:${key}`);
    expect(pttl).toBeGreaterThan(WINDOW_MS - 5_000);
    expect(pttl).toBeLessThanOrEqual(WINDOW_MS);
  });

  it('creates no key for a rejected attempt', async () => {
    expect(await store.tryAcquire('k', 0, WINDOW_MS)).toBe(false);
    expect(await raw.exists('crm:k')).toBe(0);
  });
});
