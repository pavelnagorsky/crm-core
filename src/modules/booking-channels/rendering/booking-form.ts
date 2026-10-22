import { BookingPalette } from '../enums/booking-palette.enum.js';
import { BookingFormColumns } from '../interfaces/booking-form-columns.interface.js';
import { BookingPaletteTokens } from '../interfaces/booking-palette-tokens.interface.js';
import { BookingFormConfigDto } from '../dto/booking-form-config.dto.js';
import { BookingFormThemeDto } from '../dto/booking-form-theme.dto.js';
import { BOOKING_PALETTE_PRESETS } from './booking-palette.presets.js';

export function lineFromText(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.14)`;
}

export function toBookingFormColumns(
  form: BookingFormConfigDto,
): BookingFormColumns {
  const custom =
    form.paletteId === BookingPalette.CUSTOM ? form.customPalette : null;
  return {
    palette: form.paletteId,
    customBackground: custom?.background ?? null,
    customSurface: custom?.surface ?? null,
    customText: custom?.text ?? null,
    customMuted: custom?.muted ?? null,
    customAccent: custom?.accent ?? null,
    customAccentText: custom?.accentText ?? null,
    headline: form.headline.trim(),
    caption: form.caption.trim(),
    showStaff: form.showStaff,
    showBranding: form.showBranding,
  };
}

export function toBookingFormConfig(
  record: BookingFormColumns,
): BookingFormConfigDto {
  const dto = new BookingFormConfigDto();
  dto.paletteId = record.palette;
  dto.headline = record.headline;
  dto.caption = record.caption;
  dto.showStaff = record.showStaff;
  dto.showBranding = record.showBranding;
  dto.customPalette =
    record.palette === BookingPalette.CUSTOM ? readCustomPalette(record) : null;
  return dto;
}

export function resolveBookingFormTheme(
  record: BookingFormColumns,
): BookingFormThemeDto {
  if (record.palette === BookingPalette.CUSTOM) {
    const custom = readCustomPalette(record);
    return BookingFormThemeDto.from(custom, lineFromText(custom.text));
  }
  return resolveBookingPresetTheme(record.palette);
}

export function resolveBookingPresetTheme(
  palette: Exclude<BookingPalette, typeof BookingPalette.CUSTOM>,
): BookingFormThemeDto {
  const preset = BOOKING_PALETTE_PRESETS[palette];
  if (!preset) throw new Error('Unknown booking palette');
  return BookingFormThemeDto.from(preset, preset.line);
}

function requiredToken(value: string | null): string {
  if (!value) throw new Error('Custom booking palette is incomplete');
  return value;
}

function readCustomPalette(record: BookingFormColumns): BookingPaletteTokens {
  return {
    background: requiredToken(record.customBackground),
    surface: requiredToken(record.customSurface),
    text: requiredToken(record.customText),
    muted: requiredToken(record.customMuted),
    accent: requiredToken(record.customAccent),
    accentText: requiredToken(record.customAccentText),
  };
}
