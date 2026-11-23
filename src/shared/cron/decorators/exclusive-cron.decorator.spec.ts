import { Logger } from '@nestjs/common';
import {
  CronExpression,
  ScheduleModule,
  SchedulerRegistry,
} from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { RedisService } from '../../redis/redis.service.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { CronLockService } from '../cron-lock.service.js';
import { CronRunService } from '../cron-run.service.js';
import { MemoryCronLockStore } from '../stores/memory-cron-lock.store.js';
import { RedisCronLockStore } from '../stores/redis-cron-lock.store.js';
import { ExclusiveCron } from './exclusive-cron.decorator.js';

class Jobs {
  readonly calls: unknown[][] = [];
  readonly factor = 2;

  @ExclusiveCron(CronExpression.EVERY_MINUTE, {
    name: 'jobs.double',
    timeZone: 'Europe/Minsk',
  })
  async double(value = 21): Promise<number> {
    this.calls.push([value]);
    return value * this.factor;
  }

  @ExclusiveCron('0 5 * * * *')
  async fail(): Promise<void> {
    throw new Error('job failed');
  }
}

function registerRunner(lock: CronLockService): CronRunService {
  const runner = new CronRunService(lock, new MetricsService());
  runner.onModuleInit();
  return runner;
}

function registerLock(acquire: (name: string) => Promise<boolean>) {
  const lock = new CronLockService(new MemoryCronLockStore());
  const spy = vi.spyOn(lock, 'acquire').mockImplementation(acquire);
  return { runner: registerRunner(lock), spy };
}

describe('ExclusiveCron', () => {
  let registered: CronRunService | null = null;

  afterEach(() => {
    registered?.onModuleDestroy();
    registered = null;
    vi.restoreAllMocks();
  });

  // Metadata keys and SchedulerType.CRON (1) of @nestjs/schedule: its constants are not exported.
  it('keeps @Cron metadata on the wrapped method', () => {
    const method = Jobs.prototype.double;

    expect(Reflect.getMetadata('SCHEDULER_TYPE', method)).toBe(1);
    expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', method)).toEqual({
      name: 'jobs.double',
      cronTime: CronExpression.EVERY_MINUTE,
      timeZone: 'Europe/Minsk',
    });
    expect(Reflect.getMetadata('SCHEDULER_NAME', method)).toBe('jobs.double');
    expect(
      Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', Jobs.prototype.fail),
    ).toEqual({ cronTime: '0 5 * * * *' });
    expect(method.name).toBe('double');
  });

  it('is scheduled by ScheduleModule and runs the wrapped method', async () => {
    const app = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [Jobs],
    }).compile();
    await app.init();
    try {
      const registry = app.get(SchedulerRegistry);
      const job = registry.getCronJob('jobs.double');

      expect(registry.getCronJobs().size).toBe(2);
      expect(job.isActive).toBe(true);
      await job.fireOnTick();
      await vi.waitFor(() => expect(app.get(Jobs).calls).toEqual([[21]]));
    } finally {
      await app.close();
    }
  });

  it('runs directly when no runner is registered', async () => {
    const jobs = new Jobs();

    await expect(jobs.double()).resolves.toBe(42);
    expect(jobs.calls).toEqual([[21]]);
  });

  it('runs when the lock is acquired, forwarding arguments and this', async () => {
    const { runner, spy } = registerLock(async () => true);
    registered = runner;
    const jobs = new Jobs();

    await expect(jobs.double(5)).resolves.toBe(10);

    expect(jobs.calls).toEqual([[5]]);
    expect(spy).toHaveBeenCalledWith('Jobs.double');
  });

  it('skips the run when another process holds the lock', async () => {
    registered = registerLock(async () => false).runner;
    const jobs = new Jobs();

    await expect(jobs.double(5)).resolves.toBeUndefined();
    expect(jobs.calls).toEqual([]);
  });

  it('runs when Redis fails', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const redis = {
      available: true,
      key: (...parts: string[]) => `klendo:${parts.join(':')}`,
      setIfAbsent: vi.fn().mockRejectedValue(new Error('Command timed out')),
    } as unknown as RedisService;
    registered = registerRunner(
      new CronLockService(new RedisCronLockStore(redis)),
    );
    const jobs = new Jobs();

    await expect(jobs.double()).resolves.toBe(42);
    expect(jobs.calls).toEqual([[21]]);
  });

  it('passes errors of the method through', async () => {
    await expect(new Jobs().fail()).rejects.toThrow('job failed');
  });
});
