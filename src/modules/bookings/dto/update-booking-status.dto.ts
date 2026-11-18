import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { SETTABLE_BOOKING_STATUSES } from '../constants/settable-booking-statuses.js';
import type { SettableBookingStatus } from '../constants/settable-booking-statuses.js';

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: SETTABLE_BOOKING_STATUSES })
  @IsEnum(SETTABLE_BOOKING_STATUSES)
  status: SettableBookingStatus;

  @ApiProperty({ type: String, required: false, maxLength: 1000 })
  @IsOptional()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason?: string;
}
