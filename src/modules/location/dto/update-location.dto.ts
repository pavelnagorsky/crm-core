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

export class UpdateLocationDto {
  @ApiProperty({ type: String, maxLength: 255, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

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
