import { Logger } from '@nestjs/common';
import { hostname } from 'node:os';
import { RedisService } from '../../redis/redis.service.js';
import { RedisCronLockStore } from './redis-cron-lock.store.js';

function createRedis(available = true) {
  return {
    available,
    key: (...parts: string[]) => `crm:${parts.join(':')}`,
    setIfAbsent: vi.fn(),
  };
}

describe('RedisCronLockStore', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sets the slot key for this process only if absent, for an hour', async () => {
    const redis = createRedis();
    redis.setIfAbsent.mockResolvedValue(true);
    const store = new RedisCronLockStore(redis as unknown as RedisService);

    await expect(store.tryAcquire('Jobs.run', 29_740_000)).resolves.toBe(true);

    expect(redis.setIfAbsent).toHaveBeenCalledWith(
      'crm:cron:Jobs.run:29740000',
      `${hostname()}:${process.pid}`,
      3600,
    );
  });

  it('refuses when another process holds the slot', async () => {
    const redis = createRedis();
    redis.setIfAbsent.mockResolvedValue(false);
    const store = new RedisCronLockStore(redis as unknown as RedisService);

    await expect(store.tryAcquire('Jobs.run', 1)).resolves.toBe(false);
  });

  it('allows the run without calling Redis when it is unavailable', async () => {
    const redis = createRedis(false);
    const store = new RedisCronLockStore(redis as unknown as RedisService);

    await expect(store.tryAcquire('Jobs.run', 1)).resolves.toBe(true);
    expect(redis.setIfAbsent).not.toHaveBeenCalled();
  });

  it('allows the run when Redis fails', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const redis = createRedis();
    redis.setIfAbsent.mockRejectedValue(new Error('Command timed out'));
    const store = new RedisCronLockStore(redis as unknown as RedisService);

    await expect(store.tryAcquire('Jobs.run', 1)).resolves.toBe(true);
    expect(warn.mock.calls[0][0]).toContain('Command timed out');
  });
});
