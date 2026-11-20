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
  it.each([undefined, true, false])(
    'accepts isCustomTime=%s',
    async (isCustomTime) => {
      const dto = Object.assign(new UpdateBookingDto(), { isCustomTime });
      expect(await validate(dto, { whitelist: true })).toHaveLength(0);
      expect(dto.isCustomTime).toBe(isCustomTime);
    },
  );

  it.each(['true', 'false', 0, 1])(
    'rejects isCustomTime=%s',
    async (isCustomTime) => {
      const dto = Object.assign(new UpdateBookingDto(), { isCustomTime });
      expect(await validate(dto)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'isCustomTime' }),
        ]),
      );
    },
  );
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

  it('strips the channel field from manual requests', async () => {
    const dto = Object.assign(manual({ isCustomTime: true }), {
      channel: 'MANUAL',
    });

    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
    expect(dto).not.toHaveProperty('channel');
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

describe('ManualCreateBookingDto client and status', () => {
  const manual = (fields: Record<string, unknown>) =>
    Object.assign(new ManualCreateBookingDto(), {
      serviceId: '22222222-2222-4222-8222-222222222222',
      startAt: '2026-09-20T10:00:00',
      ...fields,
    });
  const properties = async (dto: ManualCreateBookingDto) =>
    (await validate(dto, { whitelist: true })).map((error) => error.property);

  it('books a stored client by id without name and phone', async () => {
    expect(
      await properties(
        manual({ clientId: '55555555-5555-4555-8555-555555555555' }),
      ),
    ).toEqual([]);
  });

  it('still requires name and phone without a client id', async () => {
    expect(await properties(manual({}))).toEqual(['firstName', 'phone']);
  });

  it('rejects a malformed client id', async () => {
    expect(await properties(manual({ clientId: 'client-1' }))).toEqual([
      'clientId',
    ]);
  });

  it.each(['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'])(
    'accepts status %s',
    async (status) => {
      expect(
        await properties(
          manual({ firstName: 'Ann', phone: '+375291112233', status }),
        ),
      ).toEqual([]);
    },
  );

  it('does not create a cancelled booking', async () => {
    expect(
      await properties(
        manual({
          firstName: 'Ann',
          phone: '+375291112233',
          status: 'CANCELLED',
        }),
      ),
    ).toEqual(['status']);
  });
});

describe('CreateBookingDto client contacts', () => {
  it('requires name and phone online even when manual-only fields are sent', async () => {
    const dto = Object.assign(new CreateBookingDto(), {
      serviceId: '22222222-2222-4222-8222-222222222222',
      startAt: '2026-09-20T10:00:00',
      anonymous: true,
      clientId: '55555555-5555-4555-8555-555555555555',
    });
    expect((await validate(dto)).map((error) => error.property).sort()).toEqual(
      ['firstName', 'phone'],
    );
  });
});
