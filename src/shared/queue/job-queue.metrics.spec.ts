import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppRole } from '../enums/app-role.enum.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { metricValue } from '../metrics/testing/metric-value.js';
import { JobQueueMetrics } from './job-queue.metrics.js';
import { JobQueueService } from './job-queue.service.js';

const EMAIL_QUEUE = {
  name: 'email',
  readyCount: 3,
  deferredCount: 2,
  activeCount: 1,
  failedCount: 4,
};

function setup(role: AppRole, ready = true) {
  const getQueues = vi.fn().mockResolvedValue([EMAIL_QUEUE]);
  const jobQueue = { ready, boss: { getQueues } } as unknown as JobQueueService;
  const { registry } = new MetricsService();
  new JobQueueMetrics(
    jobQueue,
    { registry },
    new ConfigService({ app: { role } }),
  );
  return { registry, getQueues };
}

describe('JobQueueMetrics', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports the jobs of each queue by state', async () => {
    const { registry } = setup(AppRole.WORKER);

    for (const [state, value] of [
      ['ready', 3],
      ['deferred', 2],
      ['active', 1],
      ['failed', 4],
    ] as const)
      expect(
        await metricValue(registry, 'klendo_job_queue_jobs', {
          queue: 'email',
          state,
        }),
      ).toBe(value);
  });

  it('is not reported by api replicas', async () => {
    const { registry, getQueues } = setup(AppRole.API);

    expect(
      await metricValue(registry, 'klendo_job_queue_jobs'),
    ).toBeUndefined();
    expect(getQueues).not.toHaveBeenCalled();
  });

  it('leaves the queue out while it is not started', async () => {
    const { registry, getQueues } = setup(AppRole.ALL, false);

    expect(
      await metricValue(registry, 'klendo_job_queue_jobs'),
    ).toBeUndefined();
    expect(getQueues).not.toHaveBeenCalled();
  });

  it('keeps the scrape working when the counts cannot be read', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { registry, getQueues } = setup(AppRole.WORKER);
    getQueues.mockRejectedValue(new Error('db down'));

    await expect(registry.metrics()).resolves.toContain(
      'klendo_job_queue_jobs',
    );
    expect(
      await metricValue(registry, 'klendo_job_queue_jobs'),
    ).toBeUndefined();
  });
});
