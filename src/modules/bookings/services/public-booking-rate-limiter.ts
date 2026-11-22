import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import type { SlidingWindowStore } from '../../../shared/rate-limit/interfaces/sliding-window-store.interface.js';
import { SLIDING_WINDOW_STORE } from '../../../shared/rate-limit/sliding-window-store.token.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';

const PHONE_LIMIT = 10;
const IP_LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Online booking attempts per phone and per IP in a sliding window (`booking-rate:phone:<phone>`,
 * `booking-rate:ip:<ip>`). The phone is checked first; a rejected attempt is not counted. Where the counts live and
 * what happens when that storage fails is up to the `SlidingWindowStore` adapter.
 */
@Injectable()
export class PublicBookingRateLimiter {
  constructor(
    @Inject(SLIDING_WINDOW_STORE) private readonly store: SlidingWindowStore,
  ) {}

  async assertAllowed(phone: string, ip: string): Promise<void> {
    await this.consume(`booking-rate:phone:${phone}`, PHONE_LIMIT);
    await this.consume(`booking-rate:ip:${ip}`, IP_LIMIT);
  }

  private async consume(key: string, limit: number): Promise<void> {
    if (!(await this.store.tryAcquire(key, limit, WINDOW_MS))) {
      throw new AppException(
        ErrorCode.BOOKING_RATE_LIMITED,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
