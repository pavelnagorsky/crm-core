import { Logger } from '@nestjs/common';
import { hostname } from 'node:os';
import { RedisService } from '../redis/redis.service.js';
import { CronLockService } from './cron-lock.service.js';

function createRedis(available = true) {
  return {
    available,
    key: (...parts: string[]) => `crm:${parts.join(':')}`,
    setIfAbsent: vi.fn(),
  };
}

describe('CronLockService', () => {
  const now = Date.UTC(2026, 10, 22, 12, 30, 45);
  const slot = Math.floor(now / 60_000);

  afterEach(() => vi.restoreAllMocks());

  it('locks the minute slot of the run for this process', async () => {
    const redis = createRedis();
    redis.setIfAbsent.mockResolvedValue(true);
    const service = new CronLockService(redis as unknown as RedisService);

    await expect(service.acquire('Jobs.run', now)).resolves.toBe(true);

    expect(redis.setIfAbsent).toHaveBeenCalledWith(
      `crm:cron:Jobs.run:${slot}`,
      `${hostname()}:${process.pid}`,
      3600,
    );
  });

  it('uses one slot for the whole minute', async () => {
    const redis = createRedis();
    redis.setIfAbsent.mockResolvedValue(true);
    const service = new CronLockService(redis as unknown as RedisService);
    const minuteStart = slot * 60_000;

    await service.acquire('Jobs.run', minuteStart);
    await service.acquire('Jobs.run', minuteStart + 59_999);
    await service.acquire('Jobs.run', minuteStart + 60_000);

    expect(redis.setIfAbsent.mock.calls.map(([key]) => key)).toEqual([
      `crm:cron:Jobs.run:${slot}`,
      `crm:cron:Jobs.run:${slot}`,
      `crm:cron:Jobs.run:${slot + 1}`,
    ]);
  });

  it('refuses when another process holds the slot and logs at debug', async () => {
    const debug = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => {});
    const redis = createRedis();
    redis.setIfAbsent.mockResolvedValue(false);
    const service = new CronLockService(redis as unknown as RedisService);

    await expect(service.acquire('Jobs.run', now)).resolves.toBe(false);
    expect(debug).toHaveBeenCalledWith(
      'Cron Jobs.run skipped: another process runs it',
    );
  });

  it('allows the run when Redis is unavailable', async () => {
    const redis = createRedis(false);
    const service = new CronLockService(redis as unknown as RedisService);

    await expect(service.acquire('Jobs.run', now)).resolves.toBe(true);
    expect(redis.setIfAbsent).not.toHaveBeenCalled();
  });

  it('allows the run when Redis fails', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const redis = createRedis();
    redis.setIfAbsent.mockRejectedValue(new Error('Command timed out'));
    const service = new CronLockService(redis as unknown as RedisService);

    await expect(service.acquire('Jobs.run', now)).resolves.toBe(true);
    expect(warn.mock.calls[0][0]).toContain('Command timed out');
  });

  it('registers itself on init and unregisters on destroy', () => {
    const first = new CronLockService(createRedis() as unknown as RedisService);
    const second = new CronLockService(
      createRedis() as unknown as RedisService,
    );

    expect(CronLockService.registered).toBeNull();
    first.onModuleInit();
    expect(CronLockService.registered).toBe(first);
    second.onModuleInit();
    first.onModuleDestroy();
    expect(CronLockService.registered).toBe(second);
    second.onModuleDestroy();
    expect(CronLockService.registered).toBeNull();
  });
});
