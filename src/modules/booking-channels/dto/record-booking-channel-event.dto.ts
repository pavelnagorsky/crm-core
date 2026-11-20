import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { TrafficTouchDto } from '../../../shared/traffic/dto/traffic-touch.dto.js';
import { PlainObjectOrUndefined } from '../../../shared/transforms/plain-object-or-undefined.transform.js';
import { BookingChannelEvent } from '../enums/booking-channel-event.enum.js';

export class RecordBookingChannelEventDto {
  @ApiProperty({ enum: BookingChannelEvent, enumName: 'BookingChannelEvent' })
  @IsEnum(BookingChannelEvent)
  event: BookingChannelEvent;

  @ApiProperty({
    type: () => TrafficTouchDto,
    required: false,
    description:
      "The visitor's last non-direct touch, sent raw, as on booking creation. Counts the event under its source (DIRECT without it). Bad values are dropped, never rejected.",
  })
  @PlainObjectOrUndefined()
  @IsOptional()
  @ValidateNested()
  @Type(() => TrafficTouchDto)
  traffic?: TrafficTouchDto;
}
