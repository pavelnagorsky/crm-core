import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gauge } from 'prom-client';
import { IAppConfig } from '../../config/interfaces/app-config.interface.js';
import { runsBackgroundWork } from '../../config/app-role.config.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { JobQueueService } from './job-queue.service.js';

/**
 * `klendo_job_queue_jobs{queue, state}`, read on every scrape from the counts pg-boss keeps per queue (refreshed
 * by its monitor, every 60 s): no query on the job table. The queue is shared by all processes, so only one
 * process reports it — the one doing background work (`worker`, or `all`), not each `api` replica.
 * A failed read leaves the series out of this scrape rather than failing the whole scrape.
 */
@Injectable()
export class JobQueueMetrics {
  private readonly logger = new Logger(JobQueueMetrics.name);

  constructor(
    jobQueue: JobQueueService,
    { registry }: MetricsService,
    config: ConfigService,
  ) {
    if (!runsBackgroundWork(config.get<IAppConfig>('app')!.role)) return;
    const logger = this.logger;
    new Gauge({
      name: 'klendo_job_queue_jobs',
      help: 'Jobs per queue and state: ready to run, deferred (retry or start later), active, failed.',
      labelNames: ['queue', 'state'],
      registers: [registry],
      async collect() {
        this.reset();
        if (!jobQueue.ready) return;
        try {
          for (const queue of await jobQueue.boss.getQueues()) {
            this.set({ queue: queue.name, state: 'ready' }, queue.readyCount);
            this.set(
              { queue: queue.name, state: 'deferred' },
              queue.deferredCount,
            );
            this.set({ queue: queue.name, state: 'active' }, queue.activeCount);
            this.set({ queue: queue.name, state: 'failed' }, queue.failedCount);
          }
        } catch (error) {
          logger.warn(`Job queue metrics unavailable: ${String(error)}`);
        }
      },
    });
  }
}
