import { HttpStatus, Logger } from '@nestjs/common';
import { PublicBookingRateLimiter } from './public-booking-rate-limiter.js';
import { PUBLIC_BOOKING_RATE_LIMIT_SCRIPT } from './public-booking-rate-limit.script.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import {
  REDIS_KEY_PREFIX,
  RedisService,
} from '../../../shared/redis/redis.service.js';

/** A RedisService whose `eval` mirrors the sliding-window script on sorted sets kept in memory. */
function createLimiter() {
  const sets = new Map<string, Map<string, number>>();
  const redis = {
    available: true,
    key: (...parts: string[]) => REDIS_KEY_PREFIX + parts.join(':'),
    eval: vi.fn(
      async (
        _script: string,
        [key]: string[],
        [now, window, limit, member]: [number, number, number, string],
      ) => {
        const set = sets.get(key) ?? new Map<string, number>();
        sets.set(key, set);
        for (const [stored, score] of set)
          if (score <= now - window) set.delete(stored);
        if (set.size >= limit) return 0;
        set.set(member, now);
        return 1;
      },
    ),
  };
  const limiter = new PublicBookingRateLimiter(
    redis as unknown as RedisService,
  );
  return { limiter, redis, sets };
}

describe('PublicBookingRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('blocks the 11th attempt for the same phone', async () => {
    const { limiter } = createLimiter();
    for (let i = 0; i < 10; i++)
      await limiter.assertAllowed('+375291112233', `10.0.0.${i}`);
    let error: unknown;
    try {
      await limiter.assertAllowed('+375291112233', '10.0.1.1');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it('blocks the 31st attempt from the same ip', async () => {
    const { limiter } = createLimiter();
    for (let i = 0; i < 30; i++)
      await limiter.assertAllowed(
        `+3752900000${i.toString().padStart(2, '0')}`,
        '203.0.113.5',
      );
    await expect(
      limiter.assertAllowed('+375299999999', '203.0.113.5'),
    ).rejects.toThrow(AppException);
  });

  it('counts phones separately', async () => {
    const { limiter } = createLimiter();
    for (let i = 0; i < 10; i++)
      await limiter.assertAllowed('+375291111111', `10.1.0.${i}`);
    await expect(
      limiter.assertAllowed('+375292222222', '10.1.1.1'),
    ).resolves.toBeUndefined();
  });

  it('allows attempts again once the oldest leaves the 10-minute window', async () => {
    vi.useFakeTimers();
    const { limiter } = createLimiter();
    for (let i = 0; i < 10; i++)
      await limiter.assertAllowed('+375291112233', `10.0.0.${i}`);
    vi.advanceTimersByTime(10 * 60 * 1000 - 1);
    await expect(
      limiter.assertAllowed('+375291112233', '10.0.1.1'),
    ).rejects.toThrow(AppException);
    vi.advanceTimersByTime(1);
    await expect(
      limiter.assertAllowed('+375291112233', '10.0.1.1'),
    ).resolves.toBeUndefined();
  });

  it('runs the script per phone and per ip with the window, the limit and a unique member', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const { limiter, redis } = createLimiter();

    await limiter.assertAllowed('+375291112233', '203.0.113.5');

    expect(redis.eval).toHaveBeenNthCalledWith(
      1,
      PUBLIC_BOOKING_RATE_LIMIT_SCRIPT,
      ['crm:booking-rate:phone:+375291112233'],
      [1_000_000, 600_000, 10, expect.any(String)],
    );
    expect(redis.eval).toHaveBeenNthCalledWith(
      2,
      PUBLIC_BOOKING_RATE_LIMIT_SCRIPT,
      ['crm:booking-rate:ip:203.0.113.5'],
      [1_000_000, 600_000, 30, expect.any(String)],
    );
    expect(redis.eval.mock.calls[0][2][3]).not.toBe(
      redis.eval.mock.calls[1][2][3],
    );
  });

  it('does not count the ip when the phone is already over the limit', async () => {
    const { limiter, sets } = createLimiter();
    for (let i = 0; i < 10; i++)
      await limiter.assertAllowed('+375291112233', '203.0.113.5');
    await expect(
      limiter.assertAllowed('+375291112233', '203.0.113.5'),
    ).rejects.toThrow(AppException);
    expect(sets.get('crm:booking-rate:ip:203.0.113.5')?.size).toBe(10);
  });

  it('allows the attempt without calling Redis when it is unavailable', async () => {
    const { limiter, redis } = createLimiter();
    redis.available = false;

    await expect(
      limiter.assertAllowed('+375291112233', '203.0.113.5'),
    ).resolves.toBeUndefined();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('allows the attempt when Redis fails and warns at most once a minute', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const { limiter, redis } = createLimiter();
    redis.eval.mockRejectedValue(new Error('Command timed out'));

    await expect(
      limiter.assertAllowed('+375291112233', '203.0.113.5'),
    ).resolves.toBeUndefined();
    await limiter.assertAllowed('+375291112233', '203.0.113.5');

    expect(redis.eval).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Command timed out');
  });
});
