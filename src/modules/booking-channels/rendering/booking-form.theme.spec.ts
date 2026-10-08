import { BookingPalette } from '../enums/booking-palette.enum.js';
import { lineFromText, resolveBookingFormTheme } from './booking-form.js';
import { BOOKING_PALETTE_PRESETS } from './booking-palette.presets.js';
import { BookingFormColumns } from '../interfaces/booking-form-columns.interface.js';

const base: BookingFormColumns = {
  palette: BookingPalette.INK,
  customBackground: null,
  customSurface: null,
  customText: null,
  customMuted: null,
  customAccent: null,
  customAccentText: null,
  headline: 'Запись',
  caption: '',
  buttonLabel: 'Записаться',
  showStaff: true,
  showServiceImages: true,
  showBranding: true,
};

describe('booking form theme', () => {
  it('returns the authored preset, including its line', () => {
    const theme = resolveBookingFormTheme(base);
    expect(theme.background).toBe('#141210');
    expect(theme.line).toBe('rgba(247,241,232,0.14)');
    expect(theme.line).toBe(BOOKING_PALETTE_PRESETS[BookingPalette.INK].line);
    expect(BOOKING_PALETTE_PRESETS[BookingPalette.WINE].line).toBe(
      'rgba(251,240,234,0.16)',
    );
  });

  it('derives a custom line from the text color at 14% alpha', () => {
    expect(lineFromText('#F7F1E8')).toBe('rgba(247,241,232,0.14)');
    const theme = resolveBookingFormTheme({
      ...base,
      palette: BookingPalette.CUSTOM,
      customBackground: '#112233',
      customSurface: '#223344',
      customText: '#F7F1E8',
      customMuted: '#8899AA',
      customAccent: '#AABBCC',
      customAccentText: '#010203',
    });
    expect(theme.line).toBe('rgba(247,241,232,0.14)');
    expect(theme.accent).toBe('#AABBCC');
  });

  it('refuses a custom palette that is missing tokens', () => {
    expect(() =>
      resolveBookingFormTheme({ ...base, palette: BookingPalette.CUSTOM }),
    ).toThrow('Custom booking palette is incomplete');
  });
});
