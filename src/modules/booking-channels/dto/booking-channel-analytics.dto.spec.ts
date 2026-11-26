import { DEFAULT_BOOKING_WIDGET_BUTTON_APPEARANCE } from '../constants/booking-widget-button.constants.js';
import { ValidationPipe } from '@nestjs/common';
import { SaveBookingWidgetDto } from './save-booking-widget.dto.js';
import { RecordBookingChannelEventDto } from './record-booking-channel-event.dto.js';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const widget = {
  title: 'Widget',
  placement: 'DIALOG',
  trigger: 'FLOATING_BUTTON',
  buttonPosition: 'BOTTOM_RIGHT',
  status: 'DRAFT',
  buttonAppearance: { ...DEFAULT_BOOKING_WIDGET_BUTTON_APPEARANCE },
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
      { googleAnalyticsId: ' G-ABC123DEF4 ', yandexMetrikaId: ' 12345678 ' },
      { googleAnalyticsId: 'G-ABC123DEF4', yandexMetrikaId: '12345678' },
    ],
    [
      { googleAnalyticsId: '', yandexMetrikaId: ' ' },
      { googleAnalyticsId: null, yandexMetrikaId: null },
    ],
    [
      { googleAnalyticsId: null, yandexMetrikaId: null },
      { googleAnalyticsId: null, yandexMetrikaId: null },
    ],
    [{}, {}],
  ])('accepts and normalizes %j', async (input, expected) => {
    await expect(transform({ ...widget, ...input })).resolves.toMatchObject(
      expected,
    );
  });

  it.each([
    { googleAnalyticsId: 'GTM-ABC1234' },
    { googleAnalyticsId: 'g-abc' },
    { googleAnalyticsId: '<script></script>' },
    { googleAnalyticsId: `G-${'A'.repeat(31)}` },
    { googleAnalyticsId: 12 },
    { googleAnalyticsId: [] },
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
