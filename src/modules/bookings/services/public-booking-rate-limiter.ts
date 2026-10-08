import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';

const PHONE_LIMIT = 10;
const IP_LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class PublicBookingRateLimiter {
  private readonly hits = new Map<string, number[]>();

  assertAllowed(phone: string, ip: string): void {
    this.consume(`phone:${phone}`, PHONE_LIMIT);
    this.consume(`ip:${ip}`, IP_LIMIT);
  }

  private consume(key: string, limit: number): void {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (ts) => now - ts < WINDOW_MS,
    );
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      throw new AppException(
        ErrorCode.BOOKING_RATE_LIMITED,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.sweep(now);
  }

  private sweep(now: number): void {
    for (const [key, stamps] of this.hits) {
      if (stamps.every((ts) => now - ts >= WINDOW_MS)) this.hits.delete(key);
    }
  }
}
