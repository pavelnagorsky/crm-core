import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
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
}
