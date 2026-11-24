import { MetricsService } from '../metrics/metrics.service.js';
import { metricValue } from '../metrics/testing/metric-value.js';
import { CronLockService } from './cron-lock.service.js';
import { CronRunService } from './cron-run.service.js';

function createRunner(acquired = true) {
  const lock = {
    acquire: vi.fn().mockResolvedValue(acquired),
  } as unknown as CronLockService;
  const metrics = new MetricsService();
  return { runner: new CronRunService(lock, metrics), lock, metrics };
}

describe('CronRunService', () => {
  afterEach(() => vi.useRealTimers());

  it('runs the task under the lock of the job and returns its result', async () => {
    const { runner, lock } = createRunner();

    await expect(runner.run('Jobs.run', async () => 42)).resolves.toBe(42);
    expect(lock.acquire).toHaveBeenCalledWith('Jobs.run');
  });

  it('counts a successful run, its duration and when it finished', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 23, 12), toFake: ['Date'] });
    const { runner, metrics } = createRunner();

    await runner.run('Jobs.run', async () => undefined);

    const { registry } = metrics;
    const cron = { cron: 'Jobs.run' };
    expect(
      await metricValue(registry, 'klendo_cron_runs_total', {
        ...cron,
        result: 'success',
      }),
    ).toBe(1);
    expect(
      await metricValue(registry, 'klendo_cron_duration_seconds_count', cron),
    ).toBe(1);
    expect(
      await metricValue(
        registry,
        'klendo_cron_last_success_timestamp_seconds',
        cron,
      ),
    ).toBe(Date.UTC(2026, 10, 23, 12) / 1000);
  });

  it('counts a failed run and passes the error through', async () => {
    const { runner, metrics } = createRunner();

    await expect(
      runner.run('Jobs.run', async () => {
        throw new Error('job failed');
      }),
    ).rejects.toThrow('job failed');

    const { registry } = metrics;
    expect(
      await metricValue(registry, 'klendo_cron_runs_total', {
        result: 'error',
      }),
    ).toBe(1);
    expect(
      await metricValue(registry, 'klendo_cron_last_success_timestamp_seconds'),
    ).toBeUndefined();
  });

  it('skips the task when another process holds the lock', async () => {
    const { runner, metrics } = createRunner(false);
    const task = vi.fn();

    await expect(runner.run('Jobs.run', task)).resolves.toBeUndefined();

    expect(task).not.toHaveBeenCalled();
    expect(
      await metricValue(metrics.registry, 'klendo_cron_runs_total', {
        result: 'skipped',
      }),
    ).toBe(1);
    expect(
      await metricValue(metrics.registry, 'klendo_cron_duration_seconds_count'),
    ).toBeUndefined();
  });

  it('registers itself on init and unregisters on destroy', () => {
    const first = createRunner().runner;
    const second = createRunner().runner;

    expect(CronRunService.registered).toBeNull();
    first.onModuleInit();
    expect(CronRunService.registered).toBe(first);
    second.onModuleInit();
    first.onModuleDestroy();
    expect(CronRunService.registered).toBe(second);
    second.onModuleDestroy();
    expect(CronRunService.registered).toBeNull();
  });
});
