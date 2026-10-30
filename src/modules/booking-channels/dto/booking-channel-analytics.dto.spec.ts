import { ValidationPipe } from '@nestjs/common';
import { SaveBookingWidgetDto } from './save-booking-widget.dto.js';
import { RecordBookingChannelEventDto } from './record-booking-channel-event.dto.js';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const widget = {
  title: 'Widget',
  placement: 'DIALOG',
  trigger: 'FLOATING_BUTTON',
  buttonPosition: 'BOTTOM_RIGHT',
  allowedDomains: [],
  form: {
    paletteId: 'SAGE',
    customPalette: null,
    headline: 'Booking',
    caption: '',
    showStaff: true,
    showBranding: false,
  },
};
const transform = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: SaveBookingWidgetDto });

describe('widget analytics validation', () => {
  it.each([
    [
      { gtmId: ' GTM-ABC1234 ', yandexMetrikaId: ' 12345678 ' },
      { gtmId: 'GTM-ABC1234', yandexMetrikaId: '12345678' },
    ],
    [
      { gtmId: '', yandexMetrikaId: ' ' },
      { gtmId: null, yandexMetrikaId: null },
    ],
    [
      { gtmId: null, yandexMetrikaId: null },
      { gtmId: null, yandexMetrikaId: null },
    ],
    [{}, {}],
  ])('accepts and normalizes %j', async (input, expected) => {
    await expect(transform({ ...widget, ...input })).resolves.toMatchObject(
      expected,
    );
  });

  it.each([
    { gtmId: 'G-ABC1234' },
    { gtmId: 'gtm-abc' },
    { gtmId: '<script></script>' },
    { gtmId: `GTM-${'A'.repeat(29)}` },
    { gtmId: 12 },
    { gtmId: [] },
    { yandexMetrikaId: 12345678 },
    { yandexMetrikaId: '0' },
    { yandexMetrikaId: '-1' },
    { yandexMetrikaId: '01' },
    { yandexMetrikaId: '1.5' },
    { yandexMetrikaId: '1234567890123456' },
  ])('rejects %j', async (input) => {
    await expect(transform({ ...widget, ...input })).rejects.toThrow();
  });
});

describe('channel event validation', () => {
  it.each(['VIEW', 'FORM_OPEN'])('accepts %s', async (event) => {
    await expect(
      pipe.transform(
        { event },
        { type: 'body', metatype: RecordBookingChannelEventDto },
      ),
    ).resolves.toMatchObject({ event });
  });
  it.each(['BOOKING', 'booking_success', 'view', '', null, undefined, 1, []])(
    'rejects %j',
    async (event) => {
      await expect(
        pipe.transform(
          { event },
          { type: 'body', metatype: RecordBookingChannelEventDto },
        ),
      ).rejects.toThrow();
    },
  );
});
