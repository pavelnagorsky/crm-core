import { validate } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto.js';

function booking(overrides: Partial<CreateBookingDto> = {}): CreateBookingDto {
  return Object.assign(new CreateBookingDto(), {
    locationId: '11111111-1111-4111-8111-111111111111',
    serviceId: '22222222-2222-4222-8222-222222222222',
    startAt: '2026-09-20T10:00:00',
    firstName: 'Ann',
    phone: '+375291112233',
    ...overrides,
  });
}

describe('CreateBookingDto channel ids', () => {
  it('rejects both booking channel ids', async () => {
    const errors = await validate(
      booking({
        bookingPageId: '33333333-3333-4333-8333-333333333333',
        bookingWidgetId: '44444444-4444-4444-8444-444444444444',
      }),
    );
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    expect(messages).toContain(
      'Set either bookingPageId or bookingWidgetId, not both',
    );
  });

  it('accepts a single booking channel id', async () => {
    const errors = await validate(
      booking({ bookingPageId: '33333333-3333-4333-8333-333333333333' }),
    );
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    expect(messages).not.toContain(
      'Set either bookingPageId or bookingWidgetId, not both',
    );
  });
});
