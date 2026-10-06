import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BookingPalette } from '../enums/booking-palette.enum.js';
import { BookingFormPaletteConstraint } from '../decorators/booking-form-palette.constraint.js';
import { Trim } from '../decorators/trim.decorator.js';
import { BookingPaletteTokensDto } from './booking-palette-tokens.dto.js';

export class BookingFormConfigDto {
  @ApiProperty({ enum: BookingPalette, enumName: 'BookingPalette' })
  @Validate(BookingFormPaletteConstraint)
  @IsEnum(BookingPalette)
  paletteId: BookingPalette;

  @ApiProperty({ type: () => BookingPaletteTokensDto, nullable: true })
  @ValidateIf((dto: BookingFormConfigDto) => dto.customPalette != null)
  @ValidateNested()
  @Type(() => BookingPaletteTokensDto)
  customPalette: BookingPaletteTokensDto | null;

  @ApiProperty({ type: String, maxLength: 80 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  headline: string;

  @ApiProperty({ type: String, maxLength: 120 })
  @Trim()
  @IsString()
  @MaxLength(120)
  caption: string;

  @ApiProperty({ type: String, maxLength: 32 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  buttonLabel: string;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  showStaff: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  showServiceImages: boolean;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  showBranding: boolean;
}
