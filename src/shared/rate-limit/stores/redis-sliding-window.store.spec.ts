import { Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';
import { SLIDING_WINDOW_SCRIPT } from './redis-sliding-window.script.js';
import { RedisSlidingWindowStore } from './redis-sliding-window.store.js';

function createStore(available = true) {
  const redis = {
    available,
    key: (...parts: string[]) => 'klendo:' + parts.join(':'),
    eval: vi.fn(),
  };
  const store = new RedisSlidingWindowStore(redis as unknown as RedisService);
  return { store, redis };
}

describe('RedisSlidingWindowStore', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs the script with the prefixed key, now, the window, the limit and a unique member', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const { store, redis } = createStore();
    redis.eval.mockResolvedValue(1);

    await expect(
      store.tryAcquire('booking-rate:ip:203.0.113.5', 30, 600_000),
    ).resolves.toBe(true);
    await store.tryAcquire('booking-rate:ip:203.0.113.5', 30, 600_000);

    expect(redis.eval).toHaveBeenCalledWith(
      SLIDING_WINDOW_SCRIPT,
      ['klendo:booking-rate:ip:203.0.113.5'],
      [1_000_000, 600_000, 30, expect.any(String)],
    );
    expect(redis.eval.mock.calls[0][2][3]).not.toBe(
      redis.eval.mock.calls[1][2][3],
    );
  });

  it('rejects when the script reports the limit', async () => {
    const { store, redis } = createStore();
    redis.eval.mockResolvedValue(0);

    await expect(store.tryAcquire('k', 10, 600_000)).resolves.toBe(false);
  });

  it('allows the attempt without calling Redis when it is unavailable', async () => {
    const { store, redis } = createStore(false);

    await expect(store.tryAcquire('k', 10, 600_000)).resolves.toBe(true);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('allows the attempt when Redis fails and warns at most once a minute', async () => {
    vi.useFakeTimers();
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const { store, redis } = createStore();
    redis.eval.mockRejectedValue(new Error('Command timed out'));

    await expect(store.tryAcquire('k', 10, 600_000)).resolves.toBe(true);
    await expect(store.tryAcquire('k', 10, 600_000)).resolves.toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Command timed out');

    vi.advanceTimersByTime(60_000);
    await store.tryAcquire('k', 10, 600_000);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
