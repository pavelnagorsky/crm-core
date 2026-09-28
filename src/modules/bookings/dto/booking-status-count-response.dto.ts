import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '../enums/booking-status.enum.js';

export class BookingStatusCountResponseDto {
  @ApiProperty({ enum: BookingStatus, enumName: 'BookingStatus' })
  status: BookingStatus;

  @ApiProperty({ type: Number })
  count: number;
}
