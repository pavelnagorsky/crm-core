import { ApiProperty } from '@nestjs/swagger';
import { BookingWidget } from '@prisma/client';
import { BookingWidgetButtonPosition } from '../enums/booking-widget-button-position.enum.js';
import { BookingWidgetPlacement } from '../enums/booking-widget-placement.enum.js';
import { BookingWidgetTrigger } from '../enums/booking-widget-trigger.enum.js';

export class PublicBookingWidgetDetailsDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({
    enum: BookingWidgetPlacement,
    enumName: 'BookingWidgetPlacement',
  })
  placement: BookingWidgetPlacement;

  @ApiProperty({ enum: BookingWidgetTrigger, enumName: 'BookingWidgetTrigger' })
  trigger: BookingWidgetTrigger;

  @ApiProperty({
    enum: BookingWidgetButtonPosition,
    enumName: 'BookingWidgetButtonPosition',
  })
  buttonPosition: BookingWidgetButtonPosition;

  static from(widget: BookingWidget): PublicBookingWidgetDetailsDto {
    const dto = new PublicBookingWidgetDetailsDto();
    dto.id = widget.id;
    dto.placement = widget.placement;
    dto.trigger = widget.trigger;
    dto.buttonPosition = widget.buttonPosition;
    return dto;
  }
}
