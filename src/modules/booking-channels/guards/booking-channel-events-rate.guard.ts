import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { clientIp } from '../../../shared/http/request-context.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';

const WINDOW_MS = 60_000;
const LIMIT = 120;
const MAX_KEYS = 10_000;

@Injectable()
export class BookingChannelEventsRateGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  canActivate(context: ExecutionContext): boolean {
    const ip = clientIp(context.switchToHttp().getRequest<Request>());
    const now = Date.now();
    const current = this.windows.get(ip);
    if (current && current.expiresAt > now) {
      if (current.count >= LIMIT) this.reject();
      current.count++;
      return true;
    }
    if (this.windows.size >= MAX_KEYS) {
      for (const [key, window] of this.windows) {
        if (window.expiresAt <= now) this.windows.delete(key);
      }
      if (this.windows.size >= MAX_KEYS) this.reject();
    }
    this.windows.set(ip, { count: 1, expiresAt: now + WINDOW_MS });
    return true;
  }

  private reject(): never {
    throw new AppException(
      ErrorCode.BOOKING_CHANNEL_EVENTS_RATE_LIMITED,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
