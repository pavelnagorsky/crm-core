import { ExecutionContext } from '@nestjs/common';
import { BookingChannelEventsRateGuard } from './booking-channel-events-rate.guard.js';

const context = (ip: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  }) as ExecutionContext;

describe('BookingChannelEventsRateGuard', () => {
  afterEach(() => vi.useRealTimers());

  it('limits each IP and permits events again after the window', () => {
    vi.useFakeTimers();
    const guard = new BookingChannelEventsRateGuard();
    for (let i = 0; i < 120; i++)
      expect(guard.canActivate(context('first'))).toBe(true);
    expect(() => guard.canActivate(context('first'))).toThrow();
    expect(guard.canActivate(context('second'))).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(guard.canActivate(context('first'))).toBe(true);
  });
});
