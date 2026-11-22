import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MemorySlidingWindowStore } from '../../../shared/rate-limit/stores/memory-sliding-window.store.js';
import { PublicBookingRateLimiter } from './public-booking-rate-limiter.js';

function createLimiter() {
  const store = new MemorySlidingWindowStore();
  const tryAcquire = vi.spyOn(store, 'tryAcquire');
  const limiter = new PublicBookingRateLimiter(store);
  return { limiter, store, tryAcquire };
}

describe('PublicBookingRateLimiter', () => {
  let store: MemorySlidingWindowStore | undefined;

  afterEach(() => {
    store?.onApplicationShutdown();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup() {
    const created = createLimiter();
    store = created.store;
    return created;
  }

  it('blocks the 11th attempt for the same phone', async () => {
    const { limiter } = setup();
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
    const { limiter } = setup();
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
    const { limiter } = setup();
    for (let i = 0; i < 10; i++)
      await limiter.assertAllowed('+375291111111', `10.1.0.${i}`);
    await expect(
      limiter.assertAllowed('+375292222222', '10.1.1.1'),
    ).resolves.toBeUndefined();
  });

  it('allows attempts again once the oldest leaves the 10-minute window', async () => {
    vi.useFakeTimers();
    const { limiter } = setup();
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

  it('checks the phone, then the ip, each with its limit and the 10-minute window', async () => {
    const { limiter, tryAcquire } = setup();

    await limiter.assertAllowed('+375291112233', '203.0.113.5');

    expect(tryAcquire.mock.calls).toEqual([
      ['booking-rate:phone:+375291112233', 10, 600_000],
      ['booking-rate:ip:203.0.113.5', 30, 600_000],
    ]);
  });

  it('does not count the ip when the phone is already over the limit', async () => {
    const { limiter, tryAcquire } = setup();
    for (let i = 0; i < 10; i++)
      await limiter.assertAllowed('+375291112233', '203.0.113.5');
    tryAcquire.mockClear();

    await expect(
      limiter.assertAllowed('+375291112233', '203.0.113.5'),
    ).rejects.toThrow(AppException);

    expect(tryAcquire).toHaveBeenCalledTimes(1);
    // 10 attempts recorded for the ip: 20 more fit before its limit of 30.
    for (let i = 0; i < 20; i++)
      await limiter.assertAllowed(`+37529000${i}`, '203.0.113.5');
    await expect(
      limiter.assertAllowed('+375299999999', '203.0.113.5'),
    ).rejects.toThrow(AppException);
  });
});
