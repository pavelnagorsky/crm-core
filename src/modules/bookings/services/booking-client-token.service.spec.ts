import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NotFoundException } from '@nestjs/common';
import { JwtBookingClientStrategy } from '../strategies/jwt-booking-client.strategy.js';
import { booking } from '../testing/factories/booking.factory.js';
import { BookingClientTokenService } from './booking-client-token.service.js';
import { BookingEventsService } from './booking-events.service.js';

describe('Booking management links', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const config = new ConfigService({
    jwt: { bookingClientTokenSecret: 'test-booking-secret' },
    frontend: { domain: 'https://example.test/' },
  });
  const jwt = new JwtService();
  const tokens = new BookingClientTokenService(jwt, config);
  const read = { findById: vi.fn() };
  const strategy = new JwtBookingClientStrategy(config, read as never);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T09:00:00Z'));
    read.findById.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('issues different links without revoking previous ones and puts the secret in the fragment', () => {
    const first = tokens.generateClientToken(id);
    const second = tokens.generateClientToken(id);
    expect(first).not.toBe(second);
    for (const token of [first, second]) {
      const payload = jwt.verify(token, { secret: 'test-booking-secret' });
      expect(payload.bookingId).toBe(id);
      expect(payload.exp).toBeUndefined();
      const url = new URL(tokens.managementUrl(token));
      expect(url.pathname).toBe('/booking/manage');
      expect(url.search).toBe('');
      expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe(token);
    }
  });

  it('keeps access after 24 hours and follows the rescheduled booking deadline', async () => {
    const token = tokens.generateClientToken(id);
    vi.setSystemTime(new Date('2026-11-10T09:00:00Z'));
    read.findById.mockResolvedValue(
      booking({ id, endAt: new Date('2026-11-11T10:00:00Z') }),
    );
    const payload = jwt.verify(token, { secret: 'test-booking-secret' });
    await expect(strategy.validate(payload)).resolves.toMatchObject({ id });
    read.findById.mockResolvedValue(
      booking({ id, endAt: new Date('2026-11-07T09:00:00Z') }),
    );
    await expect(strategy.validate(payload)).rejects.toMatchObject({
      status: 401,
    });
  });

  it.each([{}, { bookingId: 'invalid' }, { bookingId: 42 }, null])(
    'rejects malformed signed payloads before database access: %s',
    async (payload) => {
      await expect(strategy.validate(payload as never)).rejects.toMatchObject({
        status: 401,
      });
      expect(read.findById).not.toHaveBeenCalled();
    },
  );

  it('rejects removed bookings and unavailable locations', async () => {
    read.findById.mockRejectedValue(new NotFoundException());
    await expect(strategy.validate({ bookingId: id })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('passes a full management URL to the email notification', () => {
    const emitter = { emit: vi.fn() };
    const events = new BookingEventsService(
      emitter as never,
      tokens,
      {} as never,
    );
    events.notifyCreated(
      booking({ id, clientEmail: 'client@example.test' }),
      'UTC',
    );
    const notification = emitter.emit.mock.calls[0][1];
    const url = new URL(notification.toEmail().data.manageLink);
    expect(url.origin).toBe('https://example.test');
    const token = new URLSearchParams(url.hash.slice(1)).get('token')!;
    expect(jwt.verify(token, { secret: 'test-booking-secret' }).bookingId).toBe(
      id,
    );
  });
});
