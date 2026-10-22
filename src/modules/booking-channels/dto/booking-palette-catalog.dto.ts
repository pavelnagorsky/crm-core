import { ApiProperty } from '@nestjs/swagger';
import {
  BOOKING_PALETTE_PRESETS,
  DEFAULT_BOOKING_PALETTE_ID,
} from '../rendering/booking-palette.presets.js';
import { BookingPalette } from '../enums/booking-palette.enum.js';
import { BookingPalettePresetDto } from './booking-palette-preset.dto.js';

export class BookingPaletteCatalogDto {
  @ApiProperty({ enum: BookingPalette, enumName: 'BookingPalette' })
  defaultPaletteId: BookingPalette;

  @ApiProperty({ type: () => BookingPalettePresetDto, isArray: true })
  presets: BookingPalettePresetDto[];

  static create(): BookingPaletteCatalogDto {
    const dto = new BookingPaletteCatalogDto();
    dto.defaultPaletteId = DEFAULT_BOOKING_PALETTE_ID;
    dto.presets = (
      Object.keys(BOOKING_PALETTE_PRESETS) as Array<
        Exclude<BookingPalette, typeof BookingPalette.CUSTOM>
      >
    ).map(BookingPalettePresetDto.from);
    return dto;
  }
}
