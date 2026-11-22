import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { hostname } from 'node:os';
import { RedisService } from '../redis/redis.service.js';

/** Long enough to outlive any run, short enough that old slots do not pile up. */
const LOCK_TTL_SECONDS = 3600;
const SLOT_MS = 60_000;

/**
 * Makes sure a cron fires once per minute across processes, as a safeguard for the case when two processes
 * run crons by mistake (`APP_ROLE` gives that job to a single worker). Fail-open: without Redis every run proceeds.
 *
 * `@ExclusiveCron` has no DI, so the service registers itself in a static field on init.
 * When nothing is registered (unit tests), cron methods run without a lock.
 */
@Injectable()
export class CronLockService implements OnModuleInit, OnModuleDestroy {
  private static current: CronLockService | null = null;

  private readonly logger = new Logger(CronLockService.name);
  private readonly instanceId = `${hostname()}:${process.pid}`;

  constructor(private readonly redis: RedisService) {}

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
    if (!this.redis.available) return true;
    const slot = Math.floor(now / SLOT_MS);
    try {
      const acquired = await this.redis.setIfAbsent(
        this.redis.key('cron', name, String(slot)),
        this.instanceId,
        LOCK_TTL_SECONDS,
      );
      if (!acquired)
        this.logger.debug(`Cron ${name} skipped: another process runs it`);
      return acquired;
    } catch (error) {
      // Roles already keep crons on one worker; a missed reminder is worse than a duplicate run.
      this.logger.warn(
        `Cron lock for ${name} failed, running without it: ${(error as Error).message}`,
      );
      return true;
    }
  }
}
