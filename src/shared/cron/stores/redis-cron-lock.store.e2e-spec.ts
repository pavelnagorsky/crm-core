import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { hostname } from 'node:os';
import { RedisService } from '../../redis/redis.service.js';
import { cronLockStoreContract } from '../testing/cron-lock-store.contract.js';
import { RedisCronLockStore } from './redis-cron-lock.store.js';

/** Runs against a real Redis: `REDIS_URL=redis://localhost:6379 npm run test:e2e`. */
describe.skipIf(!process.env.REDIS_URL)('RedisCronLockStore (e2e)', () => {
  // Own logical database: the test flushes it, and e2e files run in parallel (13-15 are taken).
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  url.pathname = '/12';

  let redis: RedisService;
  let raw: Redis;
  let store: RedisCronLockStore;

  beforeAll(async () => {
    redis = new RedisService(new ConfigService({ redis: { url: url.href } }));
    await redis.onModuleInit();
    raw = new Redis(url.href);
    store = new RedisCronLockStore(redis);
  });

  beforeEach(async () => {
    await raw.flushdb();
  });

  afterAll(async () => {
    await raw.flushdb();
    await raw.quit();
    await redis.onApplicationShutdown();
  });

  cronLockStoreContract(() => store);

  it('stores the holder under crm:cron:<name>:<slot> for an hour', async () => {
    await store.tryAcquire('Jobs.run', 7);

    expect(await raw.get('crm:cron:Jobs.run:7')).toBe(
      `${hostname()}:${process.pid}`,
    );
    const ttl = await raw.ttl('crm:cron:Jobs.run:7');
    expect(ttl).toBeGreaterThan(3590);
    expect(ttl).toBeLessThanOrEqual(3600);
  });
});
