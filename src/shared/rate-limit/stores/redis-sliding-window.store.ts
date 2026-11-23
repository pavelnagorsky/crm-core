import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../../redis/redis.service.js';
import { SlidingWindowStore } from '../interfaces/sliding-window-store.interface.js';
import { SLIDING_WINDOW_SCRIPT } from './redis-sliding-window.script.js';

/** While Redis fails every attempt fails the same way: warn at most once per interval. */
const WARNING_INTERVAL_MS = 60_000;

/**
 * Sliding windows in Redis, shared by all replicas: a sorted set of attempt times per key (`crm:<key>`, TTL = window).
 * Fail-open: when Redis is unavailable or fails, the attempt is allowed.
 */
@Injectable()
export class RedisSlidingWindowStore implements SlidingWindowStore {
  private readonly logger = new Logger(RedisSlidingWindowStore.name);
  private lastWarningAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly redis: RedisService) {}

  async tryAcquire(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    if (!this.redis.available) return true;
    try {
      const allowed = await this.redis.eval<number>(
        SLIDING_WINDOW_SCRIPT,
        [this.redis.key(key)],
        [Date.now(), windowMs, limit, randomUUID()],
      );
      return allowed === 1;
    } catch (error) {
      this.warn(error);
      return true;
    }
  }

  private warn(error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarningAt < WARNING_INTERVAL_MS) return;
    this.lastWarningAt = now;
    this.logger.warn(
      `Rate limit check failed, letting attempts through: ${String(error)}`,
    );
  }
}
