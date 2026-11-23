import { Injectable, Logger } from '@nestjs/common';
import { hostname } from 'node:os';
import { RedisService } from '../../redis/redis.service.js';
import { CronLockStore } from '../interfaces/cron-lock-store.interface.js';

/** Long enough to outlive any run, short enough that old slots do not pile up. */
const LOCK_TTL_SECONDS = 3600;

/**
 * Cron locks in Redis, shared by all processes: `SET klendo:cron:<name>:<slot> <host:pid> NX EX 3600`.
 * Fail-open: when Redis is unavailable or fails, the run proceeds.
 */
@Injectable()
export class RedisCronLockStore implements CronLockStore {
  private readonly logger = new Logger(RedisCronLockStore.name);
  private readonly instanceId = `${hostname()}:${process.pid}`;

  constructor(private readonly redis: RedisService) {}

  async tryAcquire(name: string, slot: number): Promise<boolean> {
    if (!this.redis.available) return true;
    try {
      return await this.redis.setIfAbsent(
        this.redis.key('cron', name, String(slot)),
        this.instanceId,
        LOCK_TTL_SECONDS,
      );
    } catch (error) {
      // Roles already keep crons on one worker; a missed reminder is worse than a duplicate run.
      this.logger.warn(
        `Cron lock for ${name} failed, running without it: ${(error as Error).message}`,
      );
      return true;
    }
  }
}
