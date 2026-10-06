import { ApiProperty } from '@nestjs/swagger';
import { BookingVisibility, BusinessType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsIanaTimezone } from '../../../shared/time/decorators/is-iana-timezone.validator.js';

export class CreateLocationDto {
  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ type: String, maxLength: 2 })
  @IsString()
  @MaxLength(2)
  countryCode: string;

  @ApiProperty({ type: String, maxLength: 3 })
  @IsString()
  @MaxLength(3)
  currency: string;

  @ApiProperty({ type: String, example: 'Europe/Moscow' })
  @IsString()
  @IsIanaTimezone()
  timezone: string;

  @ApiProperty({ enum: BusinessType, required: false })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @ApiProperty({ type: String, required: false, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiProperty({ type: String, required: false, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine?: string;

  @ApiProperty({ type: Number, default: 60, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  advanceBookingWindowDays?: number;

  @ApiProperty({ type: Number, default: 30, required: false })
  @IsOptional()
  @IsInt()
  @Min(5)
  slotIntervalMinutes?: number;

  @ApiProperty({ type: Number, default: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumBookingNoticeMinutes?: number;

  @ApiProperty({
    enum: BookingVisibility,
    default: BookingVisibility.PUBLIC,
    required: false,
  })
  @IsOptional()
  @IsEnum(BookingVisibility)
  bookingVisibility?: BookingVisibility;

  @ApiProperty({ type: Boolean, default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isBookingConfirmationRequired?: boolean;
}
