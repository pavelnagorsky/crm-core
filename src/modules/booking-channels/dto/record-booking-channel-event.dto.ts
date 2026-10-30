import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { BookingChannelEvent } from '../enums/booking-channel-event.enum.js';

export class RecordBookingChannelEventDto {
  @ApiProperty({ enum: BookingChannelEvent, enumName: 'BookingChannelEvent' })
  @IsEnum(BookingChannelEvent)
  event: BookingChannelEvent;
}
