import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { RedisService } from '../../../shared/redis/redis.service.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PUBLIC_BOOKING_RATE_LIMIT_SCRIPT } from './public-booking-rate-limit.script.js';

const PHONE_LIMIT = 10;
const IP_LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;
/** While Redis fails every booking fails the same way: warn at most once per interval. */
const WARNING_INTERVAL_MS = 60_000;

/**
 * Online booking attempts per phone and per IP in a sliding window, counted in Redis and shared by all
 * replicas (`crm:booking-rate:phone:<phone>`, `crm:booking-rate:ip:<ip>`). Fail-open: when Redis is
 * unavailable or fails, the attempt is allowed.
 */
@Injectable()
export class PublicBookingRateLimiter {
  private readonly logger = new Logger(PublicBookingRateLimiter.name);
  private lastWarningAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly redis: RedisService) {}

  async assertAllowed(phone: string, ip: string): Promise<void> {
    await this.consume(`phone:${phone}`, PHONE_LIMIT);
    await this.consume(`ip:${ip}`, IP_LIMIT);
  }

  private async consume(key: string, limit: number): Promise<void> {
    if (!(await this.tryConsume(key, limit))) {
      throw new AppException(
        ErrorCode.BOOKING_RATE_LIMITED,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async tryConsume(key: string, limit: number): Promise<boolean> {
    if (!this.redis.available) return true;
    try {
      const allowed = await this.redis.eval<number>(
        PUBLIC_BOOKING_RATE_LIMIT_SCRIPT,
        [this.redis.key('booking-rate', key)],
        [Date.now(), WINDOW_MS, limit, randomUUID()],
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
      `Booking rate limit check failed, letting attempts through: ${String(error)}`,
    );
  }
}
