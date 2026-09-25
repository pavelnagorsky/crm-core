import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { BookingStatus } from '../enums/booking-status.enum.js';

const allowedStatuses = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
  BookingStatus.NO_SHOW,
] as const;

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: allowedStatuses })
  @IsEnum(allowedStatuses)
  status: (typeof allowedStatuses)[number];

  @ApiProperty({ type: String, required: false, maxLength: 1000 })
  @IsOptional()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason?: string;
}
