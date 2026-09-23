import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { IsIanaTimezone } from '../../time/decorators/is-iana-timezone.validator.js';
import { BookingVisibility } from '../enums/booking-visibility.enum.js';

export class CreateBusinessDto {
  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  logoFileId?: string;

  @ApiProperty({ type: Number, default: 15, required: false })
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

  @ApiProperty({ type: String, example: 'Europe/Minsk' })
  @IsString()
  @IsIanaTimezone()
  timezone: string;

  @ApiProperty({ type: String, description: 'ISO 4217 currency code' })
  @IsString()
  @MaxLength(3)
  currency: string;

  @ApiProperty({ enum: BookingVisibility, default: BookingVisibility.PUBLIC, required: false })
  @IsOptional()
  @IsEnum(BookingVisibility)
  bookingVisibility?: BookingVisibility;

  @ApiProperty({ type: Boolean, default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isBookingConfirmationRequired?: boolean;
}
