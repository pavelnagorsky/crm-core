import { validate } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto.js';
import { ManualCreateBookingDto } from './manual-create-booking.dto.js';
import { UpdateBookingDto } from './update-booking.dto.js';

function booking(overrides: Partial<CreateBookingDto> = {}): CreateBookingDto {
  return Object.assign(new CreateBookingDto(), {
    serviceId: '22222222-2222-4222-8222-222222222222',
    startAt: '2026-09-20T10:00:00',
    firstName: 'Ann',
    phone: '+375291112233',
    ...overrides,
  });
}

describe('UpdateBookingDto custom time flag', () => {
  it.each([undefined, true, false])('accepts isCustomTime=%s', async (isCustomTime) => {
    const dto = Object.assign(new UpdateBookingDto(), { isCustomTime });
    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.isCustomTime).toBe(isCustomTime);
  });

  it.each(['true', 'false', 0, 1])('rejects isCustomTime=%s', async (isCustomTime) => {
    const dto = Object.assign(new UpdateBookingDto(), { isCustomTime });
    expect(await validate(dto)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'isCustomTime' }),
      ]),
    );
  });
});

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

describe('ManualCreateBookingDto anonymous client validation', () => {
  function manual(
    overrides: Partial<ManualCreateBookingDto> = {},
  ): ManualCreateBookingDto {
    return Object.assign(new ManualCreateBookingDto(), {
      serviceId: '22222222-2222-4222-8222-222222222222',
      startAt: '2026-09-20T10:00:00',
      anonymous: true,
      ...overrides,
    });
  }

  it('allows anonymous manual booking without name and phone', async () => {
    const errors = await validate(manual());

    expect(errors).toHaveLength(0);
  });

  it.each([true, false])('accepts isCustomTime: %s', async (isCustomTime) => {
    expect(await validate(manual({ isCustomTime }))).toHaveLength(0);
  });

  it('rejects a non-boolean custom time flag', async () => {
    const dto = Object.assign(manual(), { isCustomTime: 'true' });
    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'isCustomTime',
          constraints: expect.objectContaining({
            isBoolean: expect.any(String),
          }),
        }),
      ]),
    );
  });

  it('strips the source field from manual requests', async () => {
    const dto = Object.assign(manual({ isCustomTime: true }), {
      source: 'MANUAL',
    });

    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
    expect(dto).not.toHaveProperty('source');
    expect(dto.isCustomTime).toBe(true);
  });

  it('validates optional phone when anonymous manual booking provides it', async () => {
    const errors = await validate(manual({ phone: 'not-a-phone' }));
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

    expect(messages.length).toBeGreaterThan(0);
  });
});
