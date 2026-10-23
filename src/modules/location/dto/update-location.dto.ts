import { ApiProperty } from '@nestjs/swagger';
import {
  OptionalContact,
  OptionalLocationPhone,
  OptionalMapWidgetUrl,
} from '../decorators/contact-field.decorator.js';
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

export class UpdateLocationDto {
  @ApiProperty({ type: String, maxLength: 255, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ enum: BusinessType, required: false, nullable: true })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType | null;

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

  @OptionalLocationPhone()
  phone?: string | null;

  @OptionalContact()
  instagram?: string | null;

  @OptionalContact()
  telegram?: string | null;

  @OptionalContact()
  whatsapp?: string | null;

  @OptionalContact()
  website?: string | null;

  @OptionalMapWidgetUrl()
  mapWidgetUrl?: string | null;

  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  advanceBookingWindowDays?: number;

  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(5)
  slotIntervalMinutes?: number;

  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumBookingNoticeMinutes?: number;

  @ApiProperty({ enum: BookingVisibility, required: false })
  @IsOptional()
  @IsEnum(BookingVisibility)
  bookingVisibility?: BookingVisibility;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @IsBoolean()
  isBookingConfirmationRequired?: boolean;
}
