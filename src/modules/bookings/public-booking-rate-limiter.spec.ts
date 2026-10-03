import { HttpStatus } from '@nestjs/common';
import { PublicBookingRateLimiter } from './public-booking-rate-limiter.js';
import { AppException } from '../../shared/exceptions/app.exception.js';

function attempt(limiter: PublicBookingRateLimiter, phone: string, ip: string): void {
  limiter.assertAllowed(phone, ip);
}

describe('PublicBookingRateLimiter', () => {
  it('blocks the 11th attempt for the same phone', () => {
    const limiter = new PublicBookingRateLimiter();
    for (let i = 0; i < 10; i++) attempt(limiter, '+375291112233', `10.0.0.${i}`);
    let error: unknown;
    try {
      attempt(limiter, '+375291112233', '10.0.1.1');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('blocks the 31st attempt from the same ip', () => {
    const limiter = new PublicBookingRateLimiter();
    for (let i = 0; i < 30; i++) attempt(limiter, `+3752900000${i.toString().padStart(2, '0')}`, '203.0.113.5');
    expect(() => attempt(limiter, '+375299999999', '203.0.113.5')).toThrow(AppException);
  });

  it('counts phones separately', () => {
    const limiter = new PublicBookingRateLimiter();
    for (let i = 0; i < 10; i++) attempt(limiter, '+375291111111', `10.1.0.${i}`);
    expect(() => attempt(limiter, '+375292222222', '10.1.1.1')).not.toThrow();
  });
});
