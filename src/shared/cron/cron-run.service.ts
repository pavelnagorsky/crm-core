import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { MetricsService } from '../metrics/metrics.service.js';
import { CronLockService } from './cron-lock.service.js';
import { CronRunResult } from './enums/cron-run-result.enum.js';

/** Not `job`: Prometheus reserves it for the scrape job and would rename it to `exported_job`. */
type CronLabel = 'cron';

/**
 * Runs `@ExclusiveCron` methods: takes the minute lock (`CronLockService`) and accounts every run in metrics.
 * The `cron` label is `Class.method`, the lock name.
 *
 * `@ExclusiveCron` has no DI, so the service registers itself in a static field on init.
 * When nothing is registered (unit tests), cron methods run directly.
 */
@Injectable()
export class CronRunService implements OnModuleInit, OnModuleDestroy {
  private static current: CronRunService | null = null;

  private readonly runs: Counter<CronLabel | 'result'>;
  private readonly duration: Histogram<CronLabel>;
  private readonly lastSuccess: Gauge<CronLabel>;

  constructor(
    private readonly lock: CronLockService,
    { registry }: MetricsService,
  ) {
    this.runs = new Counter({
      name: 'klendo_cron_runs_total',
      help: 'Runs of crons by result.',
      labelNames: ['cron', 'result'],
      registers: [registry],
    });
    this.duration = new Histogram({
      name: 'klendo_cron_duration_seconds',
      help: 'Duration of cron runs that took the lock.',
      labelNames: ['cron'],
      buckets: [0.05, 0.1, 0.5, 1, 5, 15, 30, 60, 120, 300],
      registers: [registry],
    });
    this.lastSuccess = new Gauge({
      name: 'klendo_cron_last_success_timestamp_seconds',
      help: 'When a cron last finished without an error.',
      labelNames: ['cron'],
      registers: [registry],
    });
  }

  static get registered(): CronRunService | null {
    return CronRunService.current;
  }

  onModuleInit(): void {
    CronRunService.current = this;
  }

  onModuleDestroy(): void {
    if (CronRunService.current === this) CronRunService.current = null;
  }

  /** Runs `task` unless another process holds the lock of this minute (then resolves to `undefined`). */
  async run<T>(cron: string, task: () => Promise<T>): Promise<T | undefined> {
    if (!(await this.lock.acquire(cron))) {
      this.runs.inc({ cron, result: CronRunResult.SKIPPED });
      return undefined;
    }
    const end = this.duration.startTimer({ cron });
    try {
      const result = await task();
      this.runs.inc({ cron, result: CronRunResult.SUCCESS });
      this.lastSuccess.set({ cron }, Date.now() / 1000);
      return result;
    } catch (error) {
      this.runs.inc({ cron, result: CronRunResult.ERROR });
      throw error;
    } finally {
      end();
    }
  }
}
