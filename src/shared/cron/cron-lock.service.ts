import { Inject, Injectable, Logger } from '@nestjs/common';
import { CRON_LOCK_STORE } from './cron-lock-store.token.js';
import type { CronLockStore } from './interfaces/cron-lock-store.interface.js';

const SLOT_MS = 60_000;

/**
 * Makes sure a cron fires once per minute across processes, as a safeguard for the case when two processes
 * run crons by mistake (`APP_ROLE` gives that job to a single worker). The lock lives in the `CronLockStore` of the
 * configured backend: Redis across processes (fail-open: without Redis every run proceeds), or memory within one.
 * Taken by `CronRunService` before every `@ExclusiveCron` run.
 */
@Injectable()
export class CronLockService {
  private readonly logger = new Logger(CronLockService.name);

  constructor(@Inject(CRON_LOCK_STORE) private readonly store: CronLockStore) {}

  /** True when this process should run the cron `name` for the minute of `now`. */
  async acquire(name: string, now = Date.now()): Promise<boolean> {
    const acquired = await this.store.tryAcquire(
      name,
      Math.floor(now / SLOT_MS),
    );
    if (!acquired)
      this.logger.debug(`Cron ${name} skipped: another process runs it`);
    return acquired;
  }
}
