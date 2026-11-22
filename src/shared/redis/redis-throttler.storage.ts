import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { THROTTLER_INCREMENT_SCRIPT } from './redis-throttler.script.js';
import { RedisService } from './redis.service.js';

/** Not exported from the package root. */
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

/** While Redis fails every request fails the same way: warn at most once per interval. */
const WARNING_INTERVAL_MS = 60_000;

/** Returned when Redis is unavailable or fails: the request is let through (fail-open). */
const PASS: ThrottlerStorageRecord = {
  totalHits: 0,
  timeToExpire: 0,
  isBlocked: false,
  timeToBlockExpire: 0,
};

/**
 * `@nestjs/throttler` counters in Redis, shared by all replicas: `crm:throttle:<name>:<key>` (hits in the
 * current window) and `crm:throttle:<name>:<key>:block` (present while the key is blocked).
 * `ttl` and `blockDuration` come in milliseconds; `timeToExpire` and `timeToBlockExpire` are returned in
 * seconds rounded up, exactly like the built-in ThrottlerStorageService (they go into `Retry-After`).
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private lastWarningAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis.available) return { ...PASS };
    const hitsKey = this.redis.key('throttle', throttlerName, key);
    try {
      const [totalHits, windowMs, blocked, blockMs] = await this.redis.eval<
        [number, number, number, number]
      >(
        THROTTLER_INCREMENT_SCRIPT,
        [hitsKey, `${hitsKey}:block`],
        [ttl, limit, Math.max(0, blockDuration)],
      );
      return {
        totalHits,
        timeToExpire: toSeconds(windowMs),
        isBlocked: blocked === 1,
        timeToBlockExpire: blocked === 1 ? toSeconds(blockMs) : 0,
      };
    } catch (error) {
      this.warn(error);
      return { ...PASS };
    }
  }

  private warn(error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarningAt < WARNING_INTERVAL_MS) return;
    this.lastWarningAt = now;
    this.logger.warn(
      `Rate limit check failed, letting requests through: ${String(error)}`,
    );
  }
}

function toSeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}
