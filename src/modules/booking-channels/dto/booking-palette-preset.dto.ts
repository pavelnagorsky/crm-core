import { ApiProperty } from '@nestjs/swagger';
import { BookingPalette } from '../enums/booking-palette.enum.js';
import { resolveBookingPresetTheme } from '../rendering/booking-form.js';
import { BOOKING_PALETTE_PRESETS } from '../rendering/booking-palette.presets.js';
import { BookingFormThemeDto } from './booking-form-theme.dto.js';

export class BookingPalettePresetDto {
  @ApiProperty({ enum: BookingPalette, enumName: 'BookingPalette' })
  id: BookingPalette;

  @ApiProperty({ type: String })
  label: string;

  @ApiProperty({ type: String })
  description: string;

  @ApiProperty({ type: () => BookingFormThemeDto })
  theme: BookingFormThemeDto;

  static from(
    id: Exclude<BookingPalette, typeof BookingPalette.CUSTOM>,
  ): BookingPalettePresetDto {
    const preset = BOOKING_PALETTE_PRESETS[id];
    const dto = new BookingPalettePresetDto();
    dto.id = id;
    dto.label = preset.label;
    dto.description = preset.description;
    dto.theme = resolveBookingPresetTheme(id);
    return dto;
  }
}
