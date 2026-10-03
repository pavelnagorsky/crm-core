import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { BookingChannelStatus } from '../enums/booking-channel-status.enum.js';

export class UpdateBookingChannelStatusDto {
  @ApiProperty({ enum: BookingChannelStatus, enumName: 'BookingChannelStatus' })
  @IsEnum(BookingChannelStatus)
  status: BookingChannelStatus;
}
