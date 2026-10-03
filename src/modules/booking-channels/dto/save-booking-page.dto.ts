import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { Trim, TrimLower } from '../decorators/trim.decorator.js';
import { BookingFormConfigDto } from './booking-form-config.dto.js';

export class SaveBookingPageDto {
  @ApiProperty({ type: String, maxLength: 80 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title: string;

  @ApiProperty({ type: String, maxLength: 48, example: 'north-salon' })
  @TrimLower()
  @IsString()
  @MaxLength(48)
  @Matches(regularExpressions.bookingPageSlug, { message: 'slug must be lowercase letters, digits, and single hyphens' })
  slug: string;

  @ApiProperty({ type: String, maxLength: 120 })
  @Trim()
  @IsString()
  @MaxLength(120)
  tagline: string;

  @ApiProperty({ type: String, maxLength: 20000 })
  @Trim()
  @IsString()
  @MaxLength(20000)
  html: string;

  @ApiProperty({ type: String, maxLength: 70 })
  @Trim()
  @IsString()
  @MaxLength(70)
  metaTitle: string;

  @ApiProperty({ type: String, maxLength: 160 })
  @Trim()
  @IsString()
  @MaxLength(160)
  metaDescription: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  coverFileId: string | null;

  @ApiProperty({ type: () => BookingFormConfigDto })
  @ValidateNested()
  @Type(() => BookingFormConfigDto)
  form: BookingFormConfigDto;
}
