import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class InvitationRateLimiter {
  private readonly windows = new Map<
    string,
    { until: number; count: number }
  >();
  assertAllowed(ip: string): void {
    const now = Date.now();
    for (const [key, value] of this.windows)
      if (value.until <= now) this.windows.delete(key);
    const window = this.windows.get(ip) ?? { until: now + 60000, count: 0 };
    if (
      window.count >= 30 ||
      (!this.windows.has(ip) && this.windows.size >= 10000)
    )
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    window.count++;
    this.windows.set(ip, window);
  }
}
