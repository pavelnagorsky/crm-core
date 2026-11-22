import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CRON_LOCK_STORE } from './cron-lock-store.token.js';
import type { CronLockStore } from './interfaces/cron-lock-store.interface.js';

const SLOT_MS = 60_000;

/**
 * Makes sure a cron fires once per minute across processes, as a safeguard for the case when two processes
 * run crons by mistake (`APP_ROLE` gives that job to a single worker). The lock lives in the `CronLockStore` of the
 * configured backend: Redis across processes (fail-open: without Redis every run proceeds), or memory within one.
 *
 * `@ExclusiveCron` has no DI, so the service registers itself in a static field on init.
 * When nothing is registered (unit tests), cron methods run without a lock.
 */
@Injectable()
export class CronLockService implements OnModuleInit, OnModuleDestroy {
  private static current: CronLockService | null = null;

  private readonly logger = new Logger(CronLockService.name);

  constructor(@Inject(CRON_LOCK_STORE) private readonly store: CronLockStore) {}

  static get registered(): CronLockService | null {
    return CronLockService.current;
  }

  onModuleInit(): void {
    CronLockService.current = this;
  }

  onModuleDestroy(): void {
    if (CronLockService.current === this) CronLockService.current = null;
  }

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
