import { ValidationPipe } from '@nestjs/common';
import { SaveBookingWidgetDto } from './save-booking-widget.dto.js';
import { BookingWidgetButtonIcon } from '../enums/booking-widget-button-icon.enum.js';
import { DEFAULT_BOOKING_WIDGET_BUTTON_APPEARANCE } from '../constants/booking-widget-button.constants.js';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const input = {
  title: ' Widget ',
  status: 'PUBLISHED',
  placement: 'SIDEBAR',
  trigger: 'FLOATING_BUTTON',
  buttonPosition: 'BOTTOM_RIGHT',
  buttonAppearance: { ...DEFAULT_BOOKING_WIDGET_BUTTON_APPEARANCE },
  form: {
    paletteId: 'INK',
    customPalette: null,
    headline: ' Booking ',
    caption: ' ',
    showStaff: true,
    showBranding: true,
  },
};
const transform = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: SaveBookingWidgetDto });

describe('booking widget settings validation', () => {
  it('trims labels and normalizes legacy icon and colors without losing inactive settings', async () => {
    const buttonAppearance = {
      ...input.buttonAppearance,
      text: ' Book ',
      icon: 'NONE',
      color: '#abcdef',
      textColor: '#0123ab',
      fullWidth: true,
    };
    await expect(
      transform({ ...input, buttonAppearance }),
    ).resolves.toMatchObject({
      title: 'Widget',
      form: { headline: 'Booking', caption: '' },
      buttonAppearance: {
        ...buttonAppearance,
        text: 'Book',
        icon: 'CALENDAR',
        color: '#ABCDEF',
        textColor: '#0123AB',
      },
    });
  });

  it.each(Object.values(BookingWidgetButtonIcon))(
    'accepts icon %s',
    async (icon) => {
      await expect(
        transform({
          ...input,
          buttonAppearance: { ...input.buttonAppearance, icon },
        }),
      ).resolves.toHaveProperty('buttonAppearance.icon', icon);
    },
  );

  it.each([
    ['text', ' '],
    ['text', 'a'.repeat(41)],
    ['text', null],
    ['variant', 'UNKNOWN'],
    ['format', 'UNKNOWN'],
    ['size', 'UNKNOWN'],
    ['radius', 'UNKNOWN'],
    ['icon', 'UNKNOWN'],
    ['color', '#FFF'],
    ['textColor', 'red'],
    ['shadow', 'false'],
    ['fullWidth', 1],
    ['mobileIconOnly', null],
    ['offset', 7],
    ['offset', 65],
    ['offset', 24.5],
  ])('rejects invalid button %s = %j', async (field, value) => {
    await expect(
      transform({
        ...input,
        buttonAppearance: { ...input.buttonAppearance, [field]: value },
      }),
    ).rejects.toThrow();
  });

  it.each([undefined, null, [], {}, 'button'])(
    'rejects invalid button object %j',
    async (buttonAppearance) => {
      await expect(transform({ ...input, buttonAppearance })).rejects.toThrow();
    },
  );

  it.each([8, 64])('accepts offset boundary %s', async (offset) => {
    await expect(
      transform({
        ...input,
        buttonAppearance: { ...input.buttonAppearance, offset },
      }),
    ).resolves.toHaveProperty('buttonAppearance.offset', offset);
  });

  it.each([
    ['INLINE', 'FLOATING_BUTTON'],
    ['INLINE', 'INLINE_BUTTON'],
    ['SIDEBAR', 'INLINE_BUTTON'],
    ['DIALOG', 'INLINE_BUTTON'],
  ])(
    'keeps inactive offset outside the range for %s / %s',
    async (placement, trigger) => {
      await expect(
        transform({
          ...input,
          placement,
          trigger,
          buttonAppearance: { ...input.buttonAppearance, offset: 100 },
        }),
      ).resolves.toHaveProperty('buttonAppearance.offset', 100);
    },
  );

  it.each(['DRAFT', 'PUBLISHED'])('accepts status %s', async (status) => {
    await expect(transform({ ...input, status })).resolves.toHaveProperty(
      'status',
      status,
    );
  });

  it.each([undefined, null, 'ARCHIVED'])(
    'rejects invalid status %j',
    async (status) => {
      await expect(transform({ ...input, status })).rejects.toThrow();
    },
  );

  it('removes the obsolete allowedDomains key', async () => {
    expect(
      await transform({ ...input, allowedDomains: ['example.com'] }),
    ).not.toHaveProperty('allowedDomains');
  });
});
