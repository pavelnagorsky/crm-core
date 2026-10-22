import { ValidationPipe } from '@nestjs/common';
import { SaveBookingPageDto } from './save-booking-page.dto.js';
import { BookingFormConfigDto } from './booking-form-config.dto.js';
import { BookingPalette } from '../enums/booking-palette.enum.js';
import { SaveBookingWidgetDto } from './save-booking-widget.dto.js';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const form = {
  paletteId: BookingPalette.SAGE,
  customPalette: null,
  headline: 'Запись',
  caption: '',
  showStaff: true,
  showBranding: false,
};
const page = {
  title: 'Internal title',
  heading: null,
  slug: 'salon',
  tagline: '',
  html: '',
  metaTitle: '',
  metaDescription: '',
  coverFileId: null,
  form,
};
const customPalette = {
  background: '#FFFFFF',
  surface: '#F7F8FA',
  text: '#17202A',
  muted: '#6C7785',
  accent: '#1E6A48',
  accentText: '#FFFFFF',
};

describe.each([
  { metatype: SaveBookingPageDto, payload: page },
  {
    metatype: SaveBookingWidgetDto,
    payload: {
      title: 'Widget',
      placement: 'DIALOG',
      trigger: 'FLOATING_BUTTON',
      buttonPosition: 'BOTTOM_RIGHT',
      allowedDomains: [],
      form,
    },
  },
])('$metatype.name form validation', ({ metatype, payload }) => {
  it.each(
    [undefined, null, [], [form], 'invalid', 42, {}].map((value) => ({
      value,
    })),
  )('rejects a missing or invalid form: $value', async ({ value }) => {
    await expect(
      pipe.transform({ ...payload, form: value }, { type: 'body', metatype }),
    ).rejects.toThrow();
  });
});

describe('SaveBookingPageDto heading', () => {
  it.each([
    ['  Public title  ', 'Public title'],
    [null, null],
    ['', null],
    [' \n\t ', null],
    ['  <b>Plain text</b>  ', '<b>Plain text</b>'],
    [`  ${'я'.repeat(120)}  `, 'я'.repeat(120)],
  ])('normalizes %j to %j', async (heading, expected) => {
    const result = await pipe.transform(
      { ...page, heading },
      { type: 'body', metatype: SaveBookingPageDto },
    );
    expect(result.heading).toBe(expected);
  });

  it.each(
    [undefined, 1, true, false, [], ['Heading'], {}, 'я'.repeat(121)].map(
      (heading) => ({ heading }),
    ),
  )('rejects invalid heading $heading', async ({ heading }) => {
    await expect(
      pipe.transform(
        { ...page, heading },
        { type: 'body', metatype: SaveBookingPageDto },
      ),
    ).rejects.toThrow();
  });

  it('rejects an omitted heading', async () => {
    const { heading: _, ...withoutHeading } = page;
    await expect(
      pipe.transform(withoutHeading, {
        type: 'body',
        metatype: SaveBookingPageDto,
      }),
    ).rejects.toThrow();
  });
});

describe('BookingFormConfigDto palette validation', () => {
  const transform = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: BookingFormConfigDto });

  it.each(Object.values(BookingPalette).filter((id) => id !== 'CUSTOM'))(
    'accepts preset %s without custom colors',
    async (paletteId) => {
      await expect(transform({ ...form, paletteId })).resolves.toMatchObject({
        paletteId,
        customPalette: null,
      });
    },
  );

  it('accepts all six custom colors', async () => {
    await expect(
      transform({ ...form, paletteId: 'CUSTOM', customPalette }),
    ).resolves.toMatchObject({ customPalette });
  });

  it.each(Object.keys(customPalette))(
    'requires custom color %s',
    async (key) => {
      const incomplete: Record<string, string> = { ...customPalette };
      delete incomplete[key];
      await expect(
        transform({ ...form, paletteId: 'CUSTOM', customPalette: incomplete }),
      ).rejects.toThrow();
    },
  );

  it.each(['#FFF', '#12345678', 'red', '#GGGGGG', 123456, null])(
    'rejects custom color %j',
    async (accent) => {
      await expect(
        transform({
          ...form,
          paletteId: 'CUSTOM',
          customPalette: { ...customPalette, accent },
        }),
      ).rejects.toThrow();
    },
  );

  it.each([
    { paletteId: 'UNKNOWN', customPalette: null },
    { paletteId: 'CUSTOM', customPalette: null },
    { paletteId: 'CUSTOM', customPalette: [] },
    { paletteId: 'CUSTOM', customPalette: {} },
    { paletteId: 'SAGE', customPalette },
    { paletteId: 'SAGE', customPalette: undefined },
  ])('rejects invalid palette combination %j', async (selection) => {
    await expect(transform({ ...form, ...selection })).rejects.toThrow();
  });
});
