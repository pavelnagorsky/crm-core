import { Logger } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';
import { THROTTLER_INCREMENT_SCRIPT } from './redis-throttler.script.js';
import { REDIS_KEY_PREFIX, RedisService } from '../../redis/redis.service.js';

const PASS = {
  totalHits: 0,
  timeToExpire: 0,
  isBlocked: false,
  timeToBlockExpire: 0,
};

function createStorage(available = true) {
  const redis = {
    available,
    key: (...parts: string[]) => REDIS_KEY_PREFIX + parts.join(':'),
    eval: vi.fn(),
  };
  const storage = new RedisThrottlerStorage(redis as unknown as RedisService);
  return { storage, redis };
}

describe('RedisThrottlerStorage', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs the script with the hit and block keys, the window, the limit and the block duration', async () => {
    const { storage, redis } = createStorage();
    redis.eval.mockResolvedValue([1, 60_000, 0, 0]);

    await storage.increment('ip-1', 60_000, 300, 10_000, 'sustained');

    expect(redis.eval).toHaveBeenCalledWith(
      THROTTLER_INCREMENT_SCRIPT,
      ['crm:throttle:sustained:ip-1', 'crm:throttle:sustained:ip-1:block'],
      [60_000, 300, 10_000],
    );
  });

  it('returns times in whole seconds rounded up, like the built-in storage', async () => {
    const { storage, redis } = createStorage();
    redis.eval.mockResolvedValue([3, 59_001, 0, 0]);

    expect(await storage.increment('k', 60_000, 10, 60_000, 'n')).toEqual({
      totalHits: 3,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('reports a block with its remaining time in seconds', async () => {
    const { storage, redis } = createStorage();
    redis.eval.mockResolvedValue([51, 9_200, 1, 9_200]);

    expect(await storage.increment('k', 1_000, 50, 10_000, 'burst')).toEqual({
      totalHits: 51,
      timeToExpire: 10,
      isBlocked: true,
      timeToBlockExpire: 10,
    });
  });

  it('never passes a negative block duration to the script', async () => {
    const { storage, redis } = createStorage();
    redis.eval.mockResolvedValue([1, 1_000, 0, 0]);

    await storage.increment('k', 1_000, 5, -1, 'n');

    expect(redis.eval.mock.calls[0][2]).toEqual([1_000, 5, 0]);
  });

  it('lets the request through without calling Redis when it is unavailable', async () => {
    const { storage, redis } = createStorage(false);

    expect(await storage.increment('k', 1_000, 5, 1_000, 'n')).toEqual(PASS);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('lets the request through when Redis fails and warns at most once a minute', async () => {
    vi.useFakeTimers();
    const { storage, redis } = createStorage();
    redis.eval.mockRejectedValue(new Error('Command timed out'));

    expect(await storage.increment('k', 1_000, 5, 1_000, 'n')).toEqual(PASS);
    expect(await storage.increment('k', 1_000, 5, 1_000, 'n')).toEqual(PASS);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Command timed out');

    vi.advanceTimersByTime(60_000);
    await storage.increment('k', 1_000, 5, 1_000, 'n');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
