import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsUUID, Validate, ValidateNested } from 'class-validator';
import { TrafficTouchDto } from '../../../shared/traffic/dto/traffic-touch.dto.js';
import { PlainObjectOrUndefined } from '../../../shared/transforms/plain-object-or-undefined.transform.js';
import { AtMostOneBookingChannelConstraint } from '../decorators/at-most-one-booking-channel.constraint.js';
import { CreateBookingDto } from './create-booking.dto.js';

/** An online booking from the public booking page or a site widget. */
export class PublicCreateBookingDto extends CreateBookingDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Published booking page that produced this booking',
  })
  @Validate(AtMostOneBookingChannelConstraint)
  @IsOptional()
  @IsUUID()
  bookingPageId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Published booking widget that produced this booking',
  })
  @IsOptional()
  @IsUUID()
  bookingWidgetId?: string;

  @ApiProperty({
    type: () => TrafficTouchDto,
    required: false,
    description:
      "The visitor's last non-direct touch, sent raw. The backend sets the booking's traffic source from it (DIRECT without it). Bad values are dropped, never rejected. Not part of the idempotency key: a retry may resend it changed.",
  })
  @PlainObjectOrUndefined()
  @IsOptional()
  @ValidateNested()
  @Type(() => TrafficTouchDto)
  traffic?: TrafficTouchDto;
}
