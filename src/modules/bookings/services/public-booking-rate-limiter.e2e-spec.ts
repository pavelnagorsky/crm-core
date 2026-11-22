import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisService } from '../../../shared/redis/redis.service.js';
import { PUBLIC_BOOKING_RATE_LIMIT_SCRIPT } from './public-booking-rate-limit.script.js';
import { PublicBookingRateLimiter } from './public-booking-rate-limiter.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';

const WINDOW_MS = 10 * 60 * 1000;

/** Runs the Lua script against a real Redis: `REDIS_URL=redis://localhost:6379 npm run test:e2e`. */
describe.skipIf(!process.env.REDIS_URL)(
  'PublicBookingRateLimiter (e2e)',
  () => {
    // Own logical database: the test flushes it, and e2e files run in parallel (the cache spec uses 15).
    const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    url.pathname = '/13';

    let redis: RedisService;
    let raw: Redis;
    let limiter: PublicBookingRateLimiter;

    const attempt = (key: string, now: number, limit: number, member: string) =>
      redis.eval<number>(
        PUBLIC_BOOKING_RATE_LIMIT_SCRIPT,
        [key],
        [now, WINDOW_MS, limit, member],
      );

    beforeAll(async () => {
      redis = new RedisService(new ConfigService({ redis: { url: url.href } }));
      await redis.onModuleInit();
      raw = new Redis(url.href);
      limiter = new PublicBookingRateLimiter(redis);
    });

    beforeEach(async () => {
      await raw.flushdb();
    });

    afterAll(async () => {
      await raw.flushdb();
      await raw.quit();
      await redis.onApplicationShutdown();
    });

    it('blocks the 11th attempt for the same phone and does not record it', async () => {
      for (let i = 0; i < 10; i++)
        await limiter.assertAllowed('+375291112233', `10.0.0.${i}`);

      await expect(
        limiter.assertAllowed('+375291112233', '10.0.1.1'),
      ).rejects.toThrow(AppException);
      const key = 'crm:booking-rate:phone:+375291112233';
      expect(await raw.zcard(key)).toBe(10);
      expect(await raw.exists('crm:booking-rate:ip:10.0.1.1')).toBe(0);
      const pttl = await raw.pttl(key);
      expect(pttl).toBeGreaterThan(WINDOW_MS - 5_000);
      expect(pttl).toBeLessThanOrEqual(WINDOW_MS);
    });

    it('slides the window: an attempt exactly one window old no longer counts', async () => {
      const now = 1_800_000_000_000;
      expect(await attempt('k', now, 2, 'a')).toBe(1);
      expect(await attempt('k', now + 1, 2, 'b')).toBe(1);
      expect(await attempt('k', now + WINDOW_MS - 1, 2, 'c')).toBe(0);
      expect(await attempt('k', now + WINDOW_MS, 2, 'd')).toBe(1);
      expect(await raw.zrange('k', '0', '-1')).toEqual(['b', 'd']);
    });

    it('counts attempts in the same millisecond separately', async () => {
      const now = 1_800_000_000_000;
      expect(await attempt('k', now, 2, 'a')).toBe(1);
      expect(await attempt('k', now, 2, 'b')).toBe(1);
      expect(await attempt('k', now, 2, 'c')).toBe(0);
    });
  },
);
